import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { protect } from './auth.js';
import Analysis from '../models/Analysis.js';
import PostMetric from '../models/PostMetric.js';
import { 
  analyzeMetrics,
  formatAnalysisReport,
  calculateStressScore, 
  calculateInterestScore 
} from '../utils/analysisUtils.js';

const router = express.Router();

// @desc    Run analysis on user's social media metrics
// @route   POST /api/analysis/run
// @access  Private
router.post(
  '/run',
  protect,
  [
    body('timeRange')
      .optional()
      .isIn(['7d', '14d', '30d', '60d', '90d', 'custom'])
      .withMessage('Invalid time range'),
    body('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO 8601 date'),
    body('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date'),
    body('provider')
      .optional()
      .isString()
      .withMessage('Provider must be a string'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { timeRange = '30d', startDate, endDate, provider } = req.body;
    const userId = req.user._id;

    try {
      // Calculate date range
      let dateFilter = {};
      const now = new Date();
      
      if (timeRange !== 'custom') {
        const days = parseInt(timeRange);
        dateFilter.$gte = new Date(now.setDate(now.getDate() - days));
      } else if (startDate && endDate) {
        dateFilter = {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        };
      } else {
        return res.status(400).json({
          message: 'Custom date range requires both startDate and endDate',
        });
      }

      // Build query
      const query = {
        userId,
        timestamp: dateFilter,
      };

      if (provider) {
        query.provider = provider;
      }

      // Get metrics for the specified time range
      const metrics = await PostMetric.find(query).sort({ timestamp: 1 });

      if (metrics.length === 0) {
        return res.status(404).json({
          message: 'No metrics found for the specified time range',
        });
      }

      // Perform analysis
      const analysisResults = await analyzeMetrics(metrics, {
        timeRange,
        startDate: dateFilter.$gte,
        endDate: dateFilter.$lte || new Date(),
      });

      // Save analysis results
      const analysis = new Analysis({
        userId,
        timeRange,
        startDate: dateFilter.$gte,
        endDate: dateFilter.$lte || new Date(),
        metrics: analysisResults,
        postMetrics: metrics.map(m => m._id),
      });

      await analysis.save();

      // Return results
      res.status(201).json({
        message: 'Analysis completed successfully',
        analysis: {
          id: analysis._id,
          date: analysis.date,
          timeRange: analysis.timeRange,
          startDate: analysis.startDate,
          endDate: analysis.endDate,
          metrics: analysis.metrics,
          summary: analysis.summary,
        },
      });
    } catch (error) {
      console.error('Error running analysis:', error);
      res.status(500).json({
        message: 'Error running analysis',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// @desc    Get all analyses for a user
// @route   GET /api/analysis
// @access  Private
router.get(
  '/',
  protect,
  async (req, res) => {
    try {
      const analyses = await Analysis.find({ userId: req.user._id })
        .sort({ date: -1 })
        .select('-postMetrics -__v');

      res.json(analyses);
    } catch (error) {
      console.error('Error fetching analyses:', error);
      res.status(500).json({
        message: 'Error fetching analyses',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// @desc    Get a specific analysis by ID
// @route   GET /api/analysis/:id
// @access  Private
router.get(
  '/:id',
  protect,
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid analysis ID'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const analysis = await Analysis.findOne({
        _id: req.params.id,
        userId: req.user._id,
      });

      if (!analysis) {
        return res.status(404).json({ message: 'Analysis not found' });
      }

      res.json(analysis);
    } catch (error) {
      console.error('Error fetching analysis:', error);
      res.status(500).json({
        message: 'Error fetching analysis',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// @desc    Get analysis report (formatted for display)
// @route   GET /api/analysis/:id/report
// @access  Private
router.get(
  '/:id/report',
  protect,
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid analysis ID'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const analysis = await Analysis.findOne({
        _id: req.params.id,
        userId: req.user._id,
      });

      if (!analysis) {
        return res.status(404).json({ message: 'Analysis not found' });
      }

      // Format the analysis data for the report
      const report = formatAnalysisReport(analysis);

      res.json(report);
    } catch (error) {
      console.error('Error generating report:', error);
      res.status(500).json({
        message: 'Error generating report',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// @desc    Delete an analysis
// @route   DELETE /api/analysis/:id
// @access  Private
router.delete(
  '/:id',
  protect,
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid analysis ID'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const result = await Analysis.deleteOne({
        _id: req.params.id,
        userId: req.user._id,
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({ message: 'Analysis not found' });
      }

      res.json({ message: 'Analysis deleted successfully' });
    } catch (error) {
      console.error('Error deleting analysis:', error);
      res.status(500).json({
        message: 'Error deleting analysis',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Helper function to calculate interest score
function calculateInterestScore(metrics) {
  // Simple weighted average of engagement metrics
  const { likes = 0, comments = 0, shares = 0, saves = 0, watchTime = 0 } = metrics;
  
  // Normalize values (adjust weights as needed)
  const normalizedLikes = Math.min(likes / 100, 1);
  const normalizedComments = Math.min(comments / 10, 1);
  const normalizedShares = Math.min(shares / 20, 1);
  const normalizedSaves = Math.min(saves / 10, 1);
  const normalizedWatchTime = Math.min(watchTime / 60, 1); // Assuming 60 seconds is a good watch time
  
  // Weighted average (adjust weights based on importance)
  const score = (
    (normalizedLikes * 0.4) +
    (normalizedComments * 0.3) +
    (normalizedShares * 0.2) +
    (normalizedSaves * 0.05) +
    (normalizedWatchTime * 0.05)
  ) * 100; // Convert to 0-100 scale
  
  return Math.min(Math.max(score, 0), 100); // Ensure score is between 0 and 100
}

// Helper function to calculate stress score
function calculateStressScore(metrics) {
  const { sentiment = 0, negativePercentage = 0, postFrequency = 0 } = metrics;
  
  // Normalize values (adjust weights as needed)
  const normalizedSentiment = (1 - (sentiment + 1) / 2) * 100; // Convert -1 to 1 range to 0-100
  const normalizedNegative = negativePercentage; // Already 0-100
  const normalizedFrequency = Math.min(postFrequency / 5, 1) * 100; // Cap at 5 posts per day
  
  // Weighted average (adjust weights based on importance)
  const score = (
    (normalizedSentiment * 0.3) +
    (normalizedNegative * 0.5) +
    (normalizedFrequency * 0.2)
  );
  
  return Math.min(Math.max(score, 0), 100); // Ensure score is between 0 and 100
}

export { router as analysisRoutes };
