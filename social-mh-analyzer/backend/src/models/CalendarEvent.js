import mongoose from 'mongoose';

const calendarEventSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  title: {
    type: String,
    required: [true, 'Event title is required'],
    trim: true,
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot be more than 1000 characters']
  },
  start: {
    type: Date,
    required: [true, 'Start time is required'],
    index: true
  },
  end: {
    type: Date,
    validate: {
      validator: function(v) {
        // End time must be after start time if both are provided
        return !this.start || !v || v >= this.start;
      },
      message: 'End time must be after start time'
    }
  },
  allDay: {
    type: Boolean,
    default: false
  },
  
  // Mood and mental health tracking
  mood: {
    category: {
      type: String,
      enum: ['excellent', 'good', 'neutral', 'poor', 'terrible'],
      required: [true, 'Mood category is required']
    },
    energyLevel: {
      type: Number,
      min: 1,
      max: 5,
      default: 3
    },
    stressLevel: {
      type: Number,
      min: 1,
      max: 5,
      default: 3
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'Notes cannot be more than 500 characters']
    },
    tags: [{
      type: String,
      trim: true,
      lowercase: true
    }]
  },
  
  // Event type and category
  type: {
    type: String,
    enum: [
      'appointment', 'meeting', 'personal', 'work', 'study',
      'exercise', 'social', 'meal', 'sleep', 'self-care', 'other'
    ],
    default: 'personal'
  },
  
  // Location information
  location: {
    name: String,
    address: String,
    online: {
      type: Boolean,
      default: false
    },
    url: String
  },
  
  // Recurrence settings
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurrence: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'yearly'],
      required: function() { return this.isRecurring; }
    },
    interval: {
      type: Number,
      min: 1,
      default: 1
    },
    endDate: Date,
    count: Number,
    byWeekDay: [Number], // 0-6 (Sunday-Saturday)
    byMonthDay: [Number], // 1-31
    byMonth: [Number], // 1-12
    timezone: String
  },
  
  // Integration with other features
  analysisId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Analysis'
  },
  
  // Privacy settings
  isPrivate: {
    type: Boolean,
    default: true
  },
  
  // Metadata
  color: {
    type: String,
    default: '#3b82f6' // Default blue-500
  },
  
  // System fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for common queries
calendarEventSchema.index({ userId: 1, start: 1, end: 1 });
calendarEventSchema.index({ userId: 1, 'mood.category': 1, start: -1 });
calendarEventSchema.index({ userId: 1, type: 1, start: -1 });

// Virtual for event duration in minutes
calendarEventSchema.virtual('duration').get(function() {
  if (!this.start || !this.end) return 0;
  return (this.end - this.start) / (1000 * 60); // Convert ms to minutes
});

// Pre-save hook to handle end time
calendarEventSchema.pre('save', function(next) {
  // If end time is not set and it's not an all-day event, set it to 1 hour after start
  if (!this.end && !this.allDay && this.start) {
    this.end = new Date(this.start.getTime() + 60 * 60 * 1000); // +1 hour
  }
  
  // If it's an all-day event, set the time to start of day and end of day
  if (this.allDay && this.start) {
    const start = new Date(this.start);
    start.setHours(0, 0, 0, 0);
    this.start = start;
    
    if (!this.end) {
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      end.setMilliseconds(-1);
      this.end = end;
    }
  }
  
  next();
});

// Method to check if an event is happening at a specific time
calendarEventSchema.methods.isHappeningAt = function(date) {
  return date >= this.start && (!this.end || date <= this.end);
};

// Static method to get events for a date range
calendarEventSchema.statics.getEventsForRange = async function(userId, start, end, options = {}) {
  const query = {
    userId: mongoose.Types.ObjectId(userId),
    isDeleted: { $ne: true },
    $or: [
      // Events that start within the range
      { start: { $gte: start, $lt: end } },
      // Events that end within the range
      { end: { $gt: start, $lte: end } },
      // Events that span the entire range
      { $and: [
        { start: { $lte: start } },
        { $or: [
          { end: { $gte: end } },
          { end: { $exists: false } }
        ]}
      ]}
    ]
  };
  
  // Add type filter if provided
  if (options.type) {
    query.type = options.type;
  }
  
  // Add mood filter if provided
  if (options.moodCategory) {
    query['mood.category'] = options.moodCategory;
  }
  
  return this.find(query)
    .sort({ start: 1 })
    .lean();
};

// Static method to get mood statistics for a date range
calendarEventSchema.statics.getMoodStats = async function(userId, start, end) {
  const stats = await this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        isDeleted: { $ne: true },
        'mood.category': { $exists: true },
        $or: [
          { start: { $gte: start, $lt: end } },
          { end: { $gt: start, $lte: end } },
          {
            $and: [
              { start: { $lte: start } },
              { $or: [
                { end: { $gte: end } },
                { end: { $exists: false } }
              ]}
            ]
          }
        ]
      }
    },
    {
      $group: {
        _id: '$mood.category',
        count: { $sum: 1 },
        avgEnergy: { $avg: '$mood.energyLevel' },
        avgStress: { $avg: '$mood.stressLevel' },
        lastRecorded: { $max: '$start' },
        events: {
          $push: {
            id: '$_id',
            title: '$title',
            start: '$start',
            end: '$end',
            notes: '$mood.notes',
            tags: '$mood.tags'
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        mood: '$_id',
        count: 1,
        avgEnergy: { $round: ['$avgEnergy', 2] },
        avgStress: { $round: ['$avgStress', 2] },
        lastRecorded: 1,
        events: { $slice: ['$events', 5] } // Limit to 5 most recent events
      }
    },
    { $sort: { count: -1 } }
  ]);
  
  return stats;
};

const CalendarEvent = mongoose.model('CalendarEvent', calendarEventSchema);

export default CalendarEvent;
