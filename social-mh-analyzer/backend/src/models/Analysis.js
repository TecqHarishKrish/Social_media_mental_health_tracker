import mongoose from 'mongoose';

const analysisSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  date: {
    type: Date,
    required: [true, 'Analysis date is required'],
    default: Date.now,
    index: true
  },
  timeRange: {
    type: String,
    enum: ['7d', '14d', '30d', '60d', '90d', 'custom'],
    required: [true, 'Time range is required']
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required'],
    validate: {
      validator: function(v) {
        return v >= this.startDate;
      },
      message: 'End date must be after start date'
    }
  },
  
  // Core metrics
  metrics: {
    // Engagement metrics
    engagement: {
      totalPosts: { type: Number, default: 0 },
      avgLikes: { type: Number, default: 0 },
      avgComments: { type: Number, default: 0 },
      avgShares: { type: Number, default: 0 },
      avgSaves: { type: Number, default: 0 },
      engagementRate: { type: Number, default: 0 } // 0-100 scale
    },
    
    // Sentiment analysis
    sentiment: {
      overallScore: { type: Number, default: 0 }, // -1 to 1
      positive: { type: Number, default: 0 }, // 0-100%
      negative: { type: Number, default: 0 }, // 0-100%
      neutral: { type: Number, default: 0 },  // 0-100%
      comparative: { type: Number, default: 0 } // -5 to 5
    },
    
    // Mental health indicators
    mentalHealth: {
      interestScore: { type: Number, default: 0 }, // 0-100
      stressScore: { type: Number, default: 0 },   // 0-100
      moodScore: { type: Number, default: 0 },     // 0-100
      energyLevel: { type: Number, default: 0 },   // 0-100
      socialSupport: { type: Number, default: 0 }  // 0-100
    },
    
    // Risk factors
    riskFactors: {
      selfHarm: { type: Number, default: 0 },      // 0-100
      anxiety: { type: Number, default: 0 },       // 0-100
      depression: { type: Number, default: 0 },    // 0-100
      loneliness: { type: Number, default: 0 },    // 0-100
      negativeSelfTalk: { type: Number, default: 0 } // 0-100
    },
    
    // Sleep patterns (if available from timestamps)
    sleep: {
      avgSleepTime: String,        // "23:30"
      avgWakeTime: String,         // "07:30"
      avgSleepDuration: Number,    // in minutes
      consistencyScore: Number     // 0-100
    },
    
    // Activity patterns
    activity: {
      mostActiveDay: String,       // "Monday"
      mostActiveHour: Number,      // 0-23
      peakEngagementTime: String,  // "19:00-21:00"
      dailyAveragePosts: Number    // Average posts per day
    },
    
    // Content analysis
    content: {
      topics: [{
        name: String,
        score: Number,  // 0-100
        keywords: [String]
      }],
      emotions: [{
        name: String,   // e.g., "joy", "sadness", "anger"
        score: Number   // 0-100
      }],
      wordCount: {
        total: Number,
        avgPerPost: Number
      },
      emojiUsage: [{
        emoji: String,
        count: Number,
        sentiment: Number  // -1 to 1
      }]
    },
    
    // Platform-specific metrics
    byPlatform: [{
      platform: String,
      postCount: Number,
      engagement: {
        likes: Number,
        comments: Number,
        shares: Number,
        saves: Number
      },
      sentiment: Number  // -1 to 1
    }],
    
    // Time-based trends
    trends: {
      daily: [{
        date: Date,
        postCount: Number,
        sentiment: Number,
        stressScore: Number
      }],
      weekly: [{
        week: Number,
        year: Number,
        postCount: Number,
        sentiment: Number,
        stressScore: Number
      }]
    },
    
    // Risk flags
    riskFlags: [{
      type: {
        type: String,
        enum: ['self-harm', 'violence', 'hate-speech', 'bullying', 'explicit', 'other']
      },
      count: Number,
      severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical']
      },
      examples: [{
        text: String,
        timestamp: Date,
        url: String
      }]
    }]
  },
  
  // Summary and insights
  summary: {
    overall: String,
    keyFindings: [String],
    recommendations: [String],
    positiveAspects: [String],
    areasOfConcern: [String],
    notableChanges: [{
      metric: String,
      change: String,  // "increase" or "decrease"
      percentage: Number,
      significance: String  // "slight", "moderate", "significant"
    }]
  },
  
  // Raw data references
  postMetrics: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PostMetric'
  }],
  
  // Metadata
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'partial'],
    default: 'pending'
  },
  error: {
    message: String,
    stack: String,
    timestamp: Date
  },
  version: {
    type: String,
    default: '1.0.0'
  },
  
  // User feedback
  feedback: {
    accuracy: {
      type: Number,
      min: 1,
      max: 5
    },
    notes: String,
    timestamp: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for faster queries
analysisSchema.index({ userId: 1, date: -1 });
analysisSchema.index({ userId: 1, 'metrics.mentalHealth.stressScore': -1 });
analysisSchema.index({ userId: 1, 'metrics.mentalHealth.interestScore': -1 });

// Virtual for analysis period in days
analysisSchema.virtual('periodInDays').get(function() {
  return Math.ceil((this.endDate - this.startDate) / (1000 * 60 * 60 * 24));
});

// Pre-save hook to calculate derived metrics
analysisSchema.pre('save', function(next) {
  // Ensure end date is not in the future
  if (this.endDate > new Date()) {
    this.endDate = new Date();
  }
  
  // Set the analysis date to now if not provided
  if (!this.date) {
    this.date = new Date();
  }
  
  // Calculate time range if not provided
  if (!this.timeRange) {
    const days = this.periodInDays;
    if (days <= 7) this.timeRange = '7d';
    else if (days <= 14) this.timeRange = '14d';
    else if (days <= 30) this.timeRange = '30d';
    else if (days <= 60) this.timeRange = '60d';
    else if (days <= 90) this.timeRange = '90d';
    else this.timeRange = 'custom';
  }
  
  next();
});

// Method to get analysis category based on scores
analysisSchema.methods.getCategory = function(score) {
  if (score >= 75) return 'excellent';
  if (score >= 50) return 'good';
  if (score >= 25) return 'fair';
  return 'poor';
};

// Static method to get latest analysis for a user
analysisSchema.statics.getLatestForUser = async function(userId, limit = 1) {
  return this.find({ userId })
    .sort({ date: -1 })
    .limit(limit)
    .lean();
};

// Static method to get trend data for a user
analysisSchema.statics.getTrendsForUser = async function(userId, limit = 10) {
  return this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    { $sort: { date: -1 } },
    { $limit: limit },
    {
      $project: {
        date: 1,
        'mentalHealth.interestScore': 1,
        'mentalHealth.stressScore': 1,
        'mentalHealth.moodScore': 1,
        'metrics.engagement.engagementRate': 1
      }
    },
    { $sort: { date: 1 } } // Sort chronologically for charting
  ]);
};

const Analysis = mongoose.model('Analysis', analysisSchema);

export default Analysis;
