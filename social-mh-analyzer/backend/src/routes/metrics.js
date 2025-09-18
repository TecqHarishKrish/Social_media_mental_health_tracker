import express from 'express';
import multer from 'multer';
import csvParser from 'csv-parser';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { protect } from './auth.js';
import PostMetric from '../models/PostMetric.js';
import SocialConnection from '../models/SocialConnection.js';
import { body, param, validationResult } from 'express-validator';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(path.dirname(__dirname), '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  },
});

// Helper function to process CSV file
const processCSV = (filePath, userId) => {
  return new Promise((resolve, reject) => {
    const results = [];
    const errors = [];
    let rowCount = 0;
    const batchSize = 100;
    let batch = [];
    
    const processBatch = async (batchData) => {
      try {
        // In a real app, you would validate and transform the data here
        const processedBatch = batchData.map(item => {
          // Basic validation and transformation
          const metric = {
            userId,
            provider: item.provider || 'manual',
            providerPostId: item.providerPostId || `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date(item.timestamp) || new Date(),
            metrics: {
              likes: parseInt(item.likes) || 0,
              comments: parseInt(item.comments) || 0,
              shares: parseInt(item.shares) || 0,
              saves: parseInt(item.saves) || 0,
              watchTimeSeconds: parseInt(item.watchTimeSeconds) || 0,
              sentiment: item.sentiment ? JSON.parse(item.sentiment) : { score: 0, comparative: 0, tokens: [], positive: [], negative: [] },
            },
            text: item.text || '',
            mediaUrls: item.mediaUrls ? item.mediaUrls.split(';').filter(url => url.trim() !== '') : [],
            mediaType: item.mediaType || 'other',
            source: 'csv_import',
            sourceId: `batch_${Date.now()}`,
          };
          
          return metric;
        });
        
        // Insert batch into database
        await PostMetric.insertMany(processedBatch, { ordered: false });
        return processedBatch.length;
      } catch (error) {
        console.error('Error processing batch:', error);
        return 0;
      }
    };
    
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', async (data) => {
        try {
          rowCount++;
          batch.push(data);
          
          // Process in batches
          if (batch.length >= batchSize) {
            const currentBatch = [...batch];
            batch = [];
            const processedCount = await processBatch(currentBatch);
            results.push(...currentBatch);
          }
        } catch (error) {
          errors.push({
            row: rowCount,
            error: error.message,
            data,
          });
        }
      })
      .on('end', async () => {
        try {
          // Process remaining items in the last batch
          if (batch.length > 0) {
            const processedCount = await processBatch(batch);
            results.push(...batch);
          }
          
          // Clean up the file
          fs.unlink(filePath, (err) => {
            if (err) console.error('Error deleting temp file:', err);
          });
          
          resolve({
            total: rowCount,
            success: results.length,
            errors: errors.length,
            errorDetails: errors,
          });
        } catch (error) {
          reject(error);
        }
      })
      .on('error', (error) => {
        reject(error);
      });
  });
};

// @desc    Upload CSV file with social media metrics
// @route   POST /api/metrics/upload
// @access  Private
router.post(
  '/upload',
  protect,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const result = await processCSV(req.file.path, req.user._id);
      
      res.json({
        message: 'File processed successfully',
        ...result,
      });
    } catch (error) {
      console.error('Error processing CSV:', error);
      
      // Clean up the file if it exists
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error('Error deleting temp file:', err);
        });
      }
      
      res.status(500).json({
        message: 'Error processing CSV file',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// @desc    Ingest metrics data via JSON API
// @route   POST /api/metrics/ingest
// @access  Private
router.post(
  '/ingest',
  [
    protect,
    body().isArray().withMessage('Request body must be an array of metrics'),
    body('*.provider').isString().notEmpty().withMessage('Provider is required'),
    body('*.providerPostId').isString().notEmpty().withMessage('Post ID is required'),
    body('*.timestamp').optional().isISO8601().withMessage('Invalid timestamp format'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const metrics = req.body;
    const userId = req.user._id;
    const results = {
      total: metrics.length,
      success: 0,
      errors: 0,
      errorDetails: [],
    };

    try {
      // Process metrics in batches
      const batchSize = 50;
      for (let i = 0; i < metrics.length; i += batchSize) {
        const batch = metrics.slice(i, i + batchSize);
        
        const processedBatch = batch.map(item => {
          try {
            // Validate and transform the data
            return {
              userId,
              provider: item.provider,
              providerPostId: item.providerPostId,
              timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
              metrics: {
                likes: parseInt(item.likes) || 0,
                comments: parseInt(item.comments) || 0,
                shares: parseInt(item.shares) || 0,
                saves: parseInt(item.saves) || 0,
                watchTimeSeconds: parseInt(item.watchTimeSeconds) || 0,
                sentiment: item.sentiment || { score: 0, comparative: 0 },
              },
              text: item.text || '',
              mediaUrls: Array.isArray(item.mediaUrls) ? item.mediaUrls : [],
              mediaType: item.mediaType || 'other',
              source: 'api',
              sourceId: item.sourceId || `api_${Date.now()}_${i}`,
              sourceMetadata: item.sourceMetadata || {},
            };
          } catch (error) {
            results.errors++;
            results.errorDetails.push({
              index: i + batch.indexOf(item),
              error: error.message,
              item,
            });
            return null;
          }
        }).filter(item => item !== null);

        // Insert valid items
        if (processedBatch.length > 0) {
          try {
            await PostMetric.insertMany(processedBatch, { ordered: false });
            results.success += processedBatch.length;
          } catch (error) {
            // Handle duplicate key errors and other bulk write errors
            if (error.code === 11000) {
              // Handle duplicate key errors
              const duplicateCount = error.result.result.nInserted || 0;
              const duplicateErrors = error.result.result.writeErrors?.length || 0;
              results.success += duplicateCount;
              results.errors += duplicateErrors;
              
              // Add error details for duplicates
              if (error.result.result.writeErrors) {
                error.result.result.writeErrors.forEach(writeError => {
                  results.errorDetails.push({
                    index: i + writeError.index,
                    error: writeError.errmsg,
                    code: writeError.code,
                  });
                });
              }
            } else {
              // For other errors, fail the entire batch
              throw error;
            }
          }
        }
      }

      res.status(201).json({
        message: 'Metrics ingested successfully',
        ...results,
      });
    } catch (error) {
      console.error('Error ingesting metrics:', error);
      res.status(500).json({
        message: 'Error ingesting metrics',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// @desc    Get metrics for a user
// @route   GET /api/metrics
// @access  Private
router.get(
  '/',
  protect,
  [
    body('startDate').optional().isISO8601().withMessage('Invalid start date format'),
    body('endDate').optional().isISO8601().withMessage('Invalid end date format'),
    body('provider').optional().isString().withMessage('Provider must be a string'),
    body('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
    body('offset').optional().isInt({ min: 0 }).withMessage('Offset must be a positive integer'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { startDate, endDate, provider, limit = 100, offset = 0 } = req.query;
    const userId = req.user._id;

    try {
      // Build query
      const query = { userId };
      
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }
      
      if (provider) {
        query.provider = provider;
      }

      // Get total count for pagination
      const total = await PostMetric.countDocuments(query);
      
      // Get paginated results
      const metrics = await PostMetric.find(query)
        .sort({ timestamp: -1 })
        .skip(parseInt(offset))
        .limit(parseInt(limit));

      res.json({
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + metrics.length < total,
        data: metrics,
      });
    } catch (error) {
      console.error('Error fetching metrics:', error);
      res.status(500).json({
        message: 'Error fetching metrics',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// @desc    Get metrics summary
// @route   GET /api/metrics/summary
// @access  Private
router.get(
  '/summary',
  protect,
  async (req, res) => {
    try {
      const userId = req.user._id;
      
      // Get summary using the static method we defined in the model
      const summary = await PostMetric.getUserMetricsSummary(userId);
      
      // Get connected social accounts
      const connections = await SocialConnection.find({ 
        userId,
        isActive: true 
      }).select('provider profile.username meta.followers meta.following meta.posts lastSynced');
      
      // Get recent metrics for charting
      const recentMetrics = await PostMetric.aggregate([
        { $match: { userId: userId } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
            },
            date: { $first: '$timestamp' },
            posts: { $sum: 1 },
            likes: { $sum: '$metrics.likes' },
            comments: { $sum: '$metrics.comments' },
            shares: { $sum: '$metrics.shares' },
            avgSentiment: { $avg: '$metrics.sentiment.score' },
          }
        },
        { $sort: { date: -1 } },
        { $limit: 30 },
        { $sort: { date: 1 } },
      ]);
      
      // Calculate engagement rate (simplified)
      const totalEngagement = (summary.totalLikes || 0) + (summary.totalComments || 0) + (summary.totalShares || 0);
      const engagementRate = summary.totalPosts > 0 
        ? Math.round((totalEngagement / summary.totalPosts) * 100) / 100 
        : 0;
      
      // Prepare response
      const response = {
        overview: {
          totalPosts: summary.totalPosts || 0,
          totalEngagement,
          engagementRate,
          avgSentiment: summary.avgSentiment ? Math.round(summary.avgSentiment * 100) / 100 : 0,
          platforms: summary.platforms || [],
          riskPosts: summary.riskPosts || 0,
          riskPercentage: summary.riskPercentage || 0,
        },
        connections,
        recentActivity: recentMetrics,
        lastUpdated: summary.lastUpdated || new Date(),
      };
      
      res.json(response);
    } catch (error) {
      console.error('Error fetching metrics summary:', error);
      res.status(500).json({
        message: 'Error fetching metrics summary',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// @desc    Delete metrics by ID or filter
// @route   DELETE /api/metrics
// @access  Private
router.delete(
  '/',
  protect,
  [
    body('ids').optional().isArray().withMessage('IDs must be an array'),
    body('startDate').optional().isISO8601().withMessage('Invalid start date format'),
    body('endDate').optional().isISO8601().withMessage('Invalid end date format'),
    body('provider').optional().isString().withMessage('Provider must be a string'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { ids, startDate, endDate, provider } = req.body;
    const userId = req.user._id;

    try {
      // Build query
      const query = { userId };
      
      if (ids && ids.length > 0) {
        query._id = { $in: ids };
      } else {
        // If no IDs provided, use date range and/or provider
        if (startDate || endDate) {
          query.timestamp = {};
          if (startDate) query.timestamp.$gte = new Date(startDate);
          if (endDate) query.timestamp.$lte = new Date(endDate);
        }
        
        if (provider) {
          query.provider = provider;
        }
        
        // Prevent accidental deletion of all records
        if (Object.keys(query).length <= 1) {
          return res.status(400).json({
            message: 'Must provide IDs or filter criteria (date range and/or provider)',
          });
        }
      }

      // Delete matching records
      const result = await PostMetric.deleteMany(query);
      
      res.json({
        message: 'Metrics deleted successfully',
        deletedCount: result.deletedCount,
      });
    } catch (error) {
      console.error('Error deleting metrics:', error);
      res.status(500).json({
        message: 'Error deleting metrics',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

export { router as metricsRoutes };
