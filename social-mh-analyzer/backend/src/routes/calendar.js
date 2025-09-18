import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { protect } from './auth.js';
import CalendarEvent from '../models/CalendarEvent.js';
import Analysis from '../models/Analysis.js';
import { sendEmail } from '../utils/mailer.js';

const router = express.Router();

// @desc    Get events for a date range
// @route   GET /api/calendar/events
// @access  Private
router.get(
  '/events',
  protect,
  [
    body('start')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO 8601 date'),
    body('end')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date'),
    body('type')
      .optional()
      .isString()
      .withMessage('Type must be a string'),
    body('mood')
      .optional()
      .isString()
      .withMessage('Mood must be a string'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { start, end, type, mood } = req.query;
    const userId = req.user._id;

    try {
      // Build query
      const query = { userId, isDeleted: { $ne: true } };
      
      // Add date range filter
      if (start || end) {
        query.start = {};
        if (start) query.start.$gte = new Date(start);
        if (end) query.start.$lte = new Date(end);
      }
      
      // Add type filter
      if (type) {
        query.type = type;
      }
      
      // Add mood filter
      if (mood) {
        query['mood.category'] = mood;
      }

      // Get events
      const events = await CalendarEvent.find(query)
        .sort({ start: 1 })
        .lean();

      res.json(events);
    } catch (error) {
      console.error('Error fetching events:', error);
      res.status(500).json({
        message: 'Error fetching events',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// @desc    Create a new calendar event
// @route   POST /api/calendar/events
// @access  Private
router.post(
  '/events',
  protect,
  [
    body('title')
      .notEmpty()
      .withMessage('Title is required')
      .isLength({ max: 100 })
      .withMessage('Title cannot be longer than 100 characters'),
    body('start')
      .notEmpty()
      .withMessage('Start time is required')
      .isISO8601()
      .withMessage('Start time must be a valid ISO 8601 date'),
    body('end')
      .optional()
      .isISO8601()
      .withMessage('End time must be a valid ISO 8601 date'),
    body('allDay')
      .optional()
      .isBoolean()
      .withMessage('allDay must be a boolean'),
    body('type')
      .optional()
      .isIn([
        'appointment', 'meeting', 'personal', 'work', 'study',
        'exercise', 'social', 'meal', 'sleep', 'self-care', 'other'
      ])
      .withMessage('Invalid event type'),
    body('mood.category')
      .optional()
      .isIn(['excellent', 'good', 'neutral', 'poor', 'terrible'])
      .withMessage('Invalid mood category'),
    body('mood.energyLevel')
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage('Energy level must be between 1 and 5'),
    body('mood.stressLevel')
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage('Stress level must be between 1 and 5'),
    body('mood.notes')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Notes cannot be longer than 500 characters'),
    body('mood.tags')
      .optional()
      .isArray()
      .withMessage('Tags must be an array'),
    body('mood.tags.*')
      .isString()
      .withMessage('Each tag must be a string'),
    body('isRecurring')
      .optional()
      .isBoolean()
      .withMessage('isRecurring must be a boolean'),
    body('recurrence')
      .optional()
      .isObject()
      .withMessage('Recurrence must be an object'),
    body('location')
      .optional()
      .isObject()
      .withMessage('Location must be an object'),
    body('color')
      .optional()
      .isHexColor()
      .withMessage('Color must be a valid hex color code'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user._id;
    const eventData = {
      ...req.body,
      userId,
      createdBy: userId,
    };

    try {
      // Create the event
      const event = new CalendarEvent(eventData);
      await event.save();

      // If this is a mood entry, check if we should trigger any alerts
      if (event.mood && event.mood.category) {
        await checkMoodAlerts(event, req.user);
      }

      res.status(201).json(event);
    } catch (error) {
      console.error('Error creating event:', error);
      res.status(500).json({
        message: 'Error creating event',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// @desc    Get a specific event
// @route   GET /api/calendar/events/:id
// @access  Private
router.get(
  '/events/:id',
  protect,
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid event ID'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const event = await CalendarEvent.findOne({
        _id: req.params.id,
        userId: req.user._id,
        isDeleted: { $ne: true },
      });

      if (!event) {
        return res.status(404).json({ message: 'Event not found' });
      }

      res.json(event);
    } catch (error) {
      console.error('Error fetching event:', error);
      res.status(500).json({
        message: 'Error fetching event',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// @desc    Update an event
// @route   PUT /api/calendar/events/:id
// @access  Private
router.put(
  '/events/:id',
  protect,
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid event ID'),
    body('title')
      .optional()
      .isLength({ max: 100 })
      .withMessage('Title cannot be longer than 100 characters'),
    body('start')
      .optional()
      .isISO8601()
      .withMessage('Start time must be a valid ISO 8601 date'),
    body('end')
      .optional()
      .isISO8601()
      .withMessage('End time must be a valid ISO 8601 date'),
    body('allDay')
      .optional()
      .isBoolean()
      .withMessage('allDay must be a boolean'),
    body('type')
      .optional()
      .isIn([
        'appointment', 'meeting', 'personal', 'work', 'study',
        'exercise', 'social', 'meal', 'sleep', 'self-care', 'other'
      ])
      .withMessage('Invalid event type'),
    body('mood.category')
      .optional()
      .isIn(['excellent', 'good', 'neutral', 'poor', 'terrible'])
      .withMessage('Invalid mood category'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user._id;
    const updateData = {
      ...req.body,
      updatedBy: userId,
    };

    try {
      const event = await CalendarEvent.findOneAndUpdate(
        { _id: id, userId },
        updateData,
        { new: true, runValidators: true }
      );

      if (!event) {
        return res.status(404).json({ message: 'Event not found' });
      }

      // If this is a mood update, check for alerts
      if (updateData.mood && updateData.mood.category) {
        await checkMoodAlerts(event, req.user);
      }

      res.json(event);
    } catch (error) {
      console.error('Error updating event:', error);
      res.status(500).json({
        message: 'Error updating event',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// @desc    Delete an event
// @route   DELETE /api/calendar/events/:id
// @access  Private
router.delete(
  '/events/:id',
  protect,
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid event ID'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user._id;

    try {
      // Soft delete by setting isDeleted flag
      const event = await CalendarEvent.findOneAndUpdate(
        { _id: id, userId },
        { 
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: userId,
        },
        { new: true }
      );

      if (!event) {
        return res.status(404).json({ message: 'Event not found' });
      }

      res.json({ message: 'Event deleted successfully' });
    } catch (error) {
      console.error('Error deleting event:', error);
      res.status(500).json({
        message: 'Error deleting event',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// @desc    Get mood statistics for a date range
// @route   GET /api/calendar/mood-stats
// @access  Private
router.get(
  '/mood-stats',
  protect,
  [
    body('start')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO 8601 date'),
    body('end')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { start, end } = req.query;
    const userId = req.user._id;

    try {
      // Build query
      const query = { 
        userId,
        isDeleted: { $ne: true },
        'mood.category': { $exists: true } 
      };
      
      // Add date range filter
      if (start || end) {
        query.start = {};
        if (start) query.start.$gte = new Date(start);
        if (end) query.start.$lte = new Date(end);
      }

      // Get mood entries
      const moodEntries = await CalendarEvent.find(query)
        .sort({ start: 1 })
        .select('start mood')
        .lean();

      // Calculate statistics
      const stats = {
        total: moodEntries.length,
        byCategory: {
          excellent: 0,
          good: 0,
          neutral: 0,
          poor: 0,
          terrible: 0,
        },
        avgEnergy: 0,
        avgStress: 0,
        dailyAverages: [],
        weeklyTrend: [],
        recentEntries: [],
      };

      if (moodEntries.length > 0) {
        // Count by category
        moodEntries.forEach(entry => {
          if (entry.mood && entry.mood.category) {
            stats.byCategory[entry.mood.category]++;
          }
          
          // Sum up energy and stress for averages
          if (entry.mood && typeof entry.mood.energyLevel === 'number') {
            stats.avgEnergy += entry.mood.energyLevel;
          }
          
          if (entry.mood && typeof entry.mood.stressLevel === 'number') {
            stats.avgStress += entry.mood.stressLevel;
          }
        });

        // Calculate averages
        stats.avgEnergy = moodEntries.length > 0 
          ? stats.avgEnergy / moodEntries.length 
          : 0;
          
        stats.avgStress = moodEntries.length > 0 
          ? stats.avgStress / moodEntries.length 
          : 0;

        // Get recent entries (last 5)
        stats.recentEntries = moodEntries
          .sort((a, b) => new Date(b.start) - new Date(a.start))
          .slice(0, 5);

        // Group by day for daily averages (simplified example)
        const dailyGroups = {};
        moodEntries.forEach(entry => {
          const date = new Date(entry.start).toISOString().split('T')[0];
          if (!dailyGroups[date]) {
            dailyGroups[date] = {
              date,
              count: 0,
              energySum: 0,
              stressSum: 0,
              categories: { excellent: 0, good: 0, neutral: 0, poor: 0, terrible: 0 },
            };
          }
          
          dailyGroups[date].count++;
          dailyGroups[date].energySum += entry.mood.energyLevel || 0;
          dailyGroups[date].stressSum += entry.mood.stressLevel || 0;
          
          if (entry.mood && entry.mood.category) {
            dailyGroups[date].categories[entry.mood.category]++;
          }
        });
        
        // Calculate daily averages
        stats.dailyAverages = Object.values(dailyGroups).map(day => ({
          date: day.date,
          avgEnergy: day.count > 0 ? day.energySum / day.count : 0,
          avgStress: day.count > 0 ? day.stressSum / day.count : 0,
          categories: day.categories,
        }));
        
        // Sort daily averages by date
        stats.dailyAverages.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Generate weekly trend (simplified example)
        const weeklyAverages = [];
        const weeks = {};
        
        moodEntries.forEach(entry => {
          const date = new Date(entry.start);
          const year = date.getFullYear();
          const weekNum = getWeekNumber(date);
          const weekKey = `${year}-W${weekNum.toString().padStart(2, '0')}`;
          
          if (!weeks[weekKey]) {
            weeks[weekKey] = {
              week: weekNum,
              year,
              count: 0,
              energySum: 0,
              stressSum: 0,
            };
          }
          
          weeks[weekKey].count++;
          weeks[weekKey].energySum += entry.mood.energyLevel || 0;
          weeks[weekKey].stressSum += entry.mood.stressLevel || 0;
        });
        
        // Calculate weekly averages
        for (const [key, week] of Object.entries(weeks)) {
          weeklyAverages.push({
            week: week.week,
            year: week.year,
            avgEnergy: week.energySum / week.count,
            avgStress: week.stressSum / week.count,
          });
        }
        
        // Sort by year and week
        stats.weeklyTrend = weeklyAverages.sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year;
          return a.week - b.week;
        });
      }

      res.json(stats);
    } catch (error) {
      console.error('Error fetching mood statistics:', error);
      res.status(500).json({
        message: 'Error fetching mood statistics',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// @desc    Get calendar view data (mood, events, analysis)
// @route   GET /api/calendar/view
// @access  Private
router.get(
  '/view',
  protect,
  [
    body('start')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO 8601 date'),
    body('end')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { start, end } = req.query;
    const userId = req.user._id;

    try {
      // Build date range (default to current month)
      const startDate = start ? new Date(start) : new Date();
      const endDate = end ? new Date(end) : new Date();
      
      if (!start) startDate.setDate(1); // Start of month
      if (!end) {
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setDate(0); // Last day of month
      }

      // Get events
      const events = await CalendarEvent.find({
        userId,
        isDeleted: { $ne: true },
        $or: [
          { start: { $gte: startDate, $lte: endDate } },
          { end: { $gte: startDate, $lte: endDate } },
          { 
            $and: [
              { start: { $lte: startDate } },
              { end: { $gte: endDate } },
            ],
          },
        ],
      }).sort({ start: 1 });

      // Get mood entries
      const moodEntries = await CalendarEvent.find({
        userId,
        isDeleted: { $ne: true },
        'mood.category': { $exists: true },
        start: { $gte: startDate, $lte: endDate },
      }).sort({ start: 1 });

      // Get analyses for the period
      const analyses = await Analysis.find({
        userId,
        date: { $gte: startDate, $lte: endDate },
      }).sort({ date: -1 });

      // Format data for calendar view
      const calendarData = {
        events: events.map(event => ({
          id: event._id,
          title: event.title,
          start: event.start,
          end: event.end,
          allDay: event.allDay,
          type: event.type,
          color: event.color,
          mood: event.mood,
        })),
        moodEntries: moodEntries.map(entry => ({
          id: entry._id,
          date: entry.start,
          mood: entry.mood,
        })),
        analyses: analyses.map(analysis => ({
          id: analysis._id,
          date: analysis.date,
          interestScore: analysis.metrics.mentalHealth.interestScore,
          stressScore: analysis.metrics.mentalHealth.stressScore,
          summary: analysis.summary,
        })),
      };

      res.json(calendarData);
    } catch (error) {
      console.error('Error fetching calendar view:', error);
      res.status(500).json({
        message: 'Error fetching calendar data',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Helper function to check for mood alerts
async function checkMoodAlerts(event, user) {
  try {
    // Only check for concerning moods
    if (!['poor', 'terrible'].includes(event.mood.category)) {
      return;
    }

    // Check if this is part of a concerning pattern
    const recentConcerningMoods = await CalendarEvent.countDocuments({
      userId: user._id,
      'mood.category': { $in: ['poor', 'terrible'] },
      start: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
      _id: { $ne: event._id }, // Exclude current event
    });

    // If this is the first concerning mood in a while, send a notification
    if (recentConcerningMoods === 0) {
      // Send email to user
      await sendEmail({
        to: user.email,
        subject: 'We noticed you\'re not feeling your best',
        text: `Hi ${user.name},\n\nWe noticed you logged a mood of "${event.mood.category}". We're here to help.\n\n` +
          `If you're feeling down, consider reaching out to someone you trust or a mental health professional.\n\n` +
          `You're not alone, and there are people who care about you.\n\n` +
          `Best regards,\nThe Social MH Analyzer Team`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>We noticed you're not feeling your best</h2>
            <p>Hi ${user.name},</p>
            <p>We noticed you logged a mood of <strong>${event.mood.category}</strong>. We're here to help.</p>
            
            <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #ffc107; margin: 15px 0;">
              <p>If you're feeling down, consider reaching out to someone you trust or a mental health professional.</p>
              <p>Remember, it's okay to ask for help when you need it.</p>
            </div>
            
            <p>You're not alone, and there are people who care about you.</p>
            
            <div style="margin: 25px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/resources" 
                 style="background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                View Mental Health Resources
              </a>
            </div>
            
            <p>Best regards,<br>The Social MH Analyzer Team</p>
          </div>
        `,
      });

      // If user is under 18 and has a parent email, notify parent
      if (user.isUnder18 && user.parentEmail) {
        await sendEmail({
          to: user.parentEmail,
          subject: `Concern about ${user.name}'s well-being`,
          text: `Dear Parent/Guardian,\n\n` +
            `We wanted to let you know that ${user.name} has logged some concerning mood entries in the Social MH Analyzer app.\n\n` +
            `While this could be a temporary feeling, we encourage you to check in with them to see how they're doing.\n\n` +
            `If you have any concerns about their mental health, please consider reaching out to a mental health professional.\n\n` +
            `Best regards,\nThe Social MH Analyzer Team`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Concern about ${user.name}'s well-being</h2>
              <p>Dear Parent/Guardian,</p>
              
              <p>We wanted to let you know that ${user.name} has logged some concerning mood entries in the Social MH Analyzer app.</p>
              
              <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #ffc107; margin: 15px 0;">
                <p>While this could be a temporary feeling, we encourage you to check in with them to see how they're doing.</p>
                <p>If you have any concerns about their mental health, please consider reaching out to a mental health professional.</p>
              </div>
              
              <p>Here are some resources that might be helpful:</p>
              <ul>
                <li><a href="https://www.nami.org/Home">National Alliance on Mental Illness (NAMI)</a></li>
                <li><a href="https://www.mentalhealth.gov/">MentalHealth.gov</a></li>
                <li><a href="https://www.crisistextline.org/">Crisis Text Line</a></li>
              </ul>
              
              <p>Best regards,<br>The Social MH Analyzer Team</p>
            </div>
          `,
        });
      }
    }
  } catch (error) {
    console.error('Error in mood alert check:', error);
    // Don't fail the request if alerting fails
  }
}

// Helper function to get ISO week number
function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

export { router as calendarRoutes };

// Note: In a production environment, you might want to:
// 1. Add rate limiting to prevent abuse
// 2. Add more comprehensive error handling
// 3. Implement caching for better performance
// 4. Add more detailed validation
// 5. Consider timezone handling for users in different timezones
