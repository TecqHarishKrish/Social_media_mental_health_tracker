import mongoose from 'mongoose';

const postMetricSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  socialConnectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SocialConnection',
    index: true
  },
  provider: {
    type: String,
    required: [true, 'Provider name is required'],
    enum: ['instagram', 'facebook', 'twitter', 'youtube', 'tiktok', 'linkedin', 'manual'],
    lowercase: true
  },
  providerPostId: {
    type: String,
    required: [true, 'Provider post ID is required'],
    index: true
  },
  timestamp: {
    type: Date,
    required: [true, 'Post timestamp is required'],
    index: true
  },
  
  // Engagement metrics
  metrics: {
    // Common metrics
    likes: {
      type: Number,
      min: 0,
      default: 0
    },
    comments: {
      type: Number,
      min: 0,
      default: 0
    },
    shares: {
      type: Number,
      min: 0,
      default: 0
    },
    saves: {
      type: Number,
      min: 0,
      default: 0
    },
    views: {
      type: Number,
      min: 0,
      default: 0
    },
    watchTimeSeconds: {
      type: Number,
      min: 0,
      default: 0
    },
    
    // Sentiment analysis
    sentiment: {
      score: {
        type: Number,
        min: -1,
        max: 1,
        default: 0
      },
      comparative: {
        type: Number,
        default: 0
      },
      tokens: [String],
      positive: [{
        word: String,
        score: Number
      }],
      negative: [{
        word: String,
        score: Number
      }]
    },
    
    // Platform-specific metrics
    platformSpecific: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },
  
  // Content
  text: {
    type: String,
    trim: true
  },
  mediaUrls: [{
    type: String,
    trim: true
  }],
  mediaType: {
    type: String,
    enum: ['image', 'video', 'carousel', 'reel', 'story', 'text', 'other'],
    default: 'other'
  },
  
  // Analysis flags
  hasSensitiveContent: {
    type: Boolean,
    default: false
  },
  riskFlags: [{
    type: String,
    enum: ['self-harm', 'violence', 'hate-speech', 'bullying', 'explicit', 'other']
  }],
  
  // Metadata
  url: {
    type: String,
    trim: true
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  
  // Source tracking
  source: {
    type: String,
    enum: ['api', 'manual', 'import', 'webhook', 'other'],
    default: 'api'
  },
  sourceId: String,
  sourceMetadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  versionKey: false
});

// Compound index for efficient querying
postMetricSchema.index({ userId: 1, provider: 1, timestamp: -1 });
postMetricSchema.index({ userId: 1, provider: 1, providerPostId: 1 }, { unique: true });

// Pre-save hook to update lastUpdated
postMetricSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

// Virtual for engagement score
postMetricSchema.virtual('engagementScore').get(function() {
  // Simple weighted engagement score (can be customized)
  const weights = {
    likes: 0.4,
    comments: 0.3,
    shares: 0.2,
    saves: 0.1
  };
  
  return Math.min(100, Math.round(
    (this.metrics.likes * weights.likes) +
    (this.metrics.comments * weights.comments) +
    (this.metrics.shares * weights.shares) +
    (this.metrics.saves * weights.saves)
  ));
});

// Static method to get metrics summary for a user
postMetricSchema.statics.getUserMetricsSummary = async function(userId, timeRange = '30d') {
  const dateFilter = {};
  const now = new Date();
  
  // Set date range based on timeRange parameter
  switch (timeRange) {
    case '7d':
      dateFilter.$gte = new Date(now.setDate(now.getDate() - 7));
      break;
    case '30d':
      dateFilter.$gte = new Date(now.setDate(now.getDate() - 30));
      break;
    case '90d':
      dateFilter.$gte = new Date(now.setDate(now.getDate() - 90));
      break;
    case 'all':
    default:
      // No date filter for 'all'
      break;
  }
  
  const matchStage = { userId: mongoose.Types.ObjectId(userId) };
  if (dateFilter.$gte) {
    matchStage.timestamp = dateFilter;
  }
  
  const result = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalPosts: { $sum: 1 },
        totalLikes: { $sum: '$metrics.likes' },
        totalComments: { $sum: '$metrics.comments' },
        totalShares: { $sum: '$metrics.shares' },
        totalSaves: { $sum: '$metrics.saves' },
        avgSentiment: { $avg: '$metrics.sentiment.score' },
        platforms: { $addToSet: '$provider' },
        riskPosts: {
          $sum: {
            $cond: [{ $gt: [{ $size: '$riskFlags' }, 0] }, 1, 0]
          }
        },
        lastUpdated: { $max: '$lastUpdated' }
      }
    },
    {
      $project: {
        _id: 0,
        totalPosts: 1,
        totalEngagement: {
          likes: '$totalLikes',
          comments: '$totalComments',
          shares: '$totalShares',
          saves: '$totalSaves'
        },
        avgEngagementPerPost: {
          likes: { $divide: ['$totalLikes', '$totalPosts'] },
          comments: { $divide: ['$totalComments', '$totalPosts'] },
          shares: { $divide: ['$totalShares', '$totalPosts'] },
          saves: { $divide: ['$totalSaves', '$totalPosts'] }
        },
        avgSentiment: 1,
        platforms: 1,
        riskPosts: 1,
        riskPercentage: {
          $multiply: [
            { $divide: ['$riskPosts', '$totalPosts'] },
            100
          ]
        },
        lastUpdated: 1
      }
    }
  ]);
  
  return result[0] || {
    totalPosts: 0,
    totalEngagement: { likes: 0, comments: 0, shares: 0, saves: 0 },
    avgEngagementPerPost: { likes: 0, comments: 0, shares: 0, saves: 0 },
    avgSentiment: 0,
    platforms: [],
    riskPosts: 0,
    riskPercentage: 0,
    lastUpdated: null
  };
};

const PostMetric = mongoose.model('PostMetric', postMetricSchema);

export default PostMetric;
