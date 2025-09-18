import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import User from '../models/User.js';
import SocialConnection from '../models/SocialConnection.js';
import PostMetric from '../models/PostMetric.js';
import Analysis from '../models/Analysis.js';
import CalendarEvent from '../models/CalendarEvent.js';

// Load environment variables
dotenv.config();

// Helper function to generate random dates within a range
function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Helper function to generate random text
function randomText(type = 'post') {
  const texts = {
    positive: [
      "Having a great day today! The sun is shining and everything feels right. #blessed #happiness",
      "Just finished an amazing project! So proud of what I've accomplished. #success #achievement",
      "Spent time with friends today. Laughter really is the best medicine. #friends #joy",
      "Grateful for all the love and support in my life. Couldn't do it without you all! #gratitude #love",
      "Just had the best meal ever! Food is my love language. #foodie #yum",
    ],
    neutral: [
      "Working on some new content. Stay tuned! #work #hustle",
      "Another day, another opportunity to make a difference. #motivation",
      "Just checking in. How's everyone doing today? #hello #checkin",
      "Thinking about life and all its possibilities. #reflection",
      "The weather is nice today. That's all. #weather #update",
    ],
    negative: [
      "Not feeling my best today. Hope tomorrow is better. #toughday #struggling",
      "Why does everything feel so hard right now? #overwhelmed #stressed",
      "Feeling lonely even when I'm not alone. #lonely #sad",
      "Had a really bad day. Don't want to talk about it. #down #notokay",
      "Sometimes I wonder if anyone would notice if I was gone. #alone #depressed",
    ],
    post: [
      "Check out this amazing view! 🌄 #nature #photography",
      "Just shared a new post about my journey. Link in bio! #blog #update",
      "Can't believe it's already [month]! Time flies when you're having fun. #timelapse",
      "Working on something exciting! Can't wait to share more details soon. #teaser #comingsoon",
      "Throwback to this amazing moment. Can't wait to make more memories! #tbt #memories",
    ]
  };
  
  const category = type === 'post' 
    ? 'post' 
    : Math.random() > 0.7 ? 'negative' : Math.random() > 0.5 ? 'neutral' : 'positive';
  
  const options = texts[category];
  return options[Math.floor(Math.random() * options.length)];
}

// Helper function to generate random engagement metrics
function generateEngagement() {
  return {
    likes: Math.floor(Math.random() * 500),
    comments: Math.floor(Math.random() * 50),
    shares: Math.floor(Math.random() * 30),
    saves: Math.floor(Math.random() * 20),
    watchTimeSeconds: Math.floor(Math.random() * 300), // Up to 5 minutes
  };
}

// Helper function to generate random sentiment
function generateSentiment(text) {
  // Simple sentiment analysis based on keywords
  const positiveWords = ['great', 'amazing', 'proud', 'happy', 'love', 'best', 'good', 'awesome', 'wonderful', 'fantastic'];
  const negativeWords = ['bad', 'sad', 'worst', 'hate', 'terrible', 'awful', 'depressed', 'lonely', 'overwhelmed', 'stressed'];
  
  const words = text.toLowerCase().split(/\s+/);
  let score = 0;
  let positive = [];
  let negative = [];
  
  words.forEach(word => {
    if (positiveWords.includes(word)) {
      score += 1;
      positive.push(word);
    } else if (negativeWords.includes(word)) {
      score -= 1;
      negative.push(word);
    }
  });
  
  // Normalize score to -1 to 1 range
  const normalizedScore = Math.max(-1, Math.min(1, score / 5));
  
  return {
    score: normalizedScore,
    comparative: normalizedScore / words.length,
    tokens: words,
    positive: [...new Set(positive)],
    negative: [...new Set(negative)],
  };
}

// Helper function to generate random post metrics
async function generatePostMetrics(userId, count = 50, options = {}) {
  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
    endDate = new Date(),
    provider = 'instagram',
  } = options;
  
  const posts = [];
  
  for (let i = 0; i < count; i++) {
    const text = randomText();
    const timestamp = randomDate(startDate, endDate);
    const engagement = generateEngagement();
    const sentiment = generateSentiment(text);
    
    posts.push({
      userId,
      provider,
      providerPostId: `${provider}_${Date.now()}_${i}`,
      timestamp,
      metrics: {
        ...engagement,
        sentiment,
      },
      text,
      mediaUrls: [`https://picsum.photos/seed/${Date.now() + i}/800/600`],
      mediaType: Math.random() > 0.5 ? 'image' : 'video',
      source: 'seed',
      sourceId: `seed_${Date.now()}_${i}`,
    });
  }
  
  return PostMetric.insertMany(posts);
}

// Helper function to generate random calendar events
async function generateCalendarEvents(userId, count = 20) {
  const events = [];
  const now = new Date();
  const startDate = new Date(now);
  startDate.setMonth(startDate.getMonth() - 1); // Last month to now
  
  const eventTypes = ['appointment', 'meeting', 'personal', 'work', 'study', 'exercise', 'social', 'meal', 'sleep', 'self-care'];
  const moodCategories = ['excellent', 'good', 'neutral', 'poor', 'terrible'];
  
  for (let i = 0; i < count; i++) {
    const isAllDay = Math.random() > 0.7;
    const start = randomDate(startDate, now);
    const end = isAllDay 
      ? new Date(start.getTime() + 24 * 60 * 60 * 1000) // Full day
      : new Date(start.getTime() + Math.random() * 4 * 60 * 60 * 1000); // 1-4 hours
    
    // 30% chance to have a mood entry
    const hasMood = Math.random() > 0.7;
    let mood = null;
    
    if (hasMood) {
      const moodIndex = Math.floor(Math.random() * moodCategories.length);
      mood = {
        category: moodCategories[moodIndex],
        energyLevel: Math.floor(Math.random() * 5) + 1, // 1-5
        stressLevel: Math.floor(Math.random() * 5) + 1, // 1-5
        notes: Math.random() > 0.5 ? randomText('neutral') : undefined,
        tags: Math.random() > 0.7 ? ['seed', 'demo'] : ['seed'],
      };
    }
    
    events.push({
      userId,
      title: `Event ${i + 1}`,
      description: `This is a sample event #${i + 1} for demonstration purposes.`,
      start,
      end,
      allDay: isAllDay,
      type: eventTypes[Math.floor(Math.random() * eventTypes.length)],
      mood,
      color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
      createdBy: userId,
    });
  }
  
  return CalendarEvent.insertMany(events);
}

// Helper function to generate analysis data
async function generateAnalysis(userId, postMetrics) {
  // Group posts by date
  const postsByDate = {};
  
  postMetrics.forEach(post => {
    const dateStr = post.timestamp.toISOString().split('T')[0];
    if (!postsByDate[dateStr]) {
      postsByDate[dateStr] = [];
    }
    postsByDate[dateStr].push(post);
  });
  
  // Calculate daily metrics
  const dailyTrends = [];
  let totalLikes = 0;
  let totalComments = 0;
  let totalShares = 0;
  let totalSaves = 0;
  let totalSentiment = 0;
  
  Object.entries(postsByDate).forEach(([date, posts]) => {
    const dailyLikes = posts.reduce((sum, post) => sum + (post.metrics.likes || 0), 0);
    const dailyComments = posts.reduce((sum, post) => sum + (post.metrics.comments || 0), 0);
    const dailyShares = posts.reduce((sum, post) => sum + (post.metrics.shares || 0), 0);
    const dailySaves = posts.reduce((sum, post) => sum + (post.metrics.saves || 0), 0);
    const dailySentiment = posts.reduce((sum, post) => sum + (post.metrics.sentiment?.score || 0), 0) / posts.length;
    
    totalLikes += dailyLikes;
    totalComments += dailyComments;
    totalShares += dailyShares;
    totalSaves += dailySaves;
    totalSentiment += dailySentiment * posts.length;
    
    dailyTrends.push({
      date,
      postCount: posts.length,
      likes: dailyLikes,
      comments: dailyComments,
      shares: dailyShares,
      sentiment: dailySentiment,
    });
  });
  
  const totalPosts = postMetrics.length;
  const avgSentiment = totalPosts > 0 ? totalSentiment / totalPosts : 0;
  
  // Calculate interest score (simplified)
  const maxLikes = Math.max(1, ...dailyTrends.map(d => d.likes));
  const maxComments = Math.max(1, ...dailyTrends.map(d => d.comments));
  const maxShares = Math.max(1, ...dailyTrends.map(d => d.shares));
  
  const normalizedLikes = (totalLikes / totalPosts) / (maxLikes / 2);
  const normalizedComments = (totalComments / totalPosts) / (maxComments * 5);
  const normalizedShares = (totalShares / totalPosts) / (maxShares * 10);
  
  const engagementScore = (normalizedLikes * 0.5 + normalizedComments * 0.3 + normalizedShares * 0.2) * 100;
  const interestScore = Math.min(100, Math.max(0, engagementScore * 0.7 + (avgSentiment + 1) * 15));
  
  // Calculate stress score (simplified)
  const negativeRatio = dailyTrends.filter(d => d.sentiment < -0.1).length / Math.max(1, dailyTrends.length);
  const postFrequency = totalPosts / 30; // Average posts per day
  
  const stressScore = Math.min(100, Math.max(0, 
    (1 - (avgSentiment + 1) / 2) * 70 + // Sentiment component (0-70)
    negativeRatio * 20 + // Frequency of negative posts (0-20)
    Math.min(postFrequency / 5, 1) * 10 // Post frequency component (0-10)
  ));
  
  // Generate summary
  const summary = {
    overall: `Your social media activity shows ${interestScore > 60 ? 'high' : interestScore > 30 ? 'moderate' : 'low'} engagement with ${stressScore > 60 ? 'elevated' : 'manageable'} stress levels.`,
    keyFindings: [
      `You've made ${totalPosts} posts in the last 30 days.`,
      `Your average engagement per post is ${Math.round((totalLikes + totalComments + totalShares) / totalPosts)} interactions.`,
      `Your content sentiment is ${avgSentiment > 0.2 ? 'positive' : avgSentiment > -0.2 ? 'neutral' : 'negative'}.`,
    ],
    recommendations: [
      'Try posting at different times to increase engagement.',
      'Engage with your audience by responding to comments.',
      'Take breaks from social media if you feel overwhelmed.',
    ],
    positiveAspects: [
      'Consistent posting schedule',
      'Good variety in content types',
    ],
    areasOfConcern: stressScore > 60 ? [
      'Elevated stress levels detected',
      'Consider taking a break from social media',
    ] : [
      'No significant concerns detected',
    ],
  };
  
  // Create analysis document
  const analysis = new Analysis({
    userId,
    timeRange: '30d',
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate: new Date(),
    metrics: {
      engagement: {
        totalPosts,
        totalLikes,
        totalComments,
        totalShares,
        totalSaves,
        avgLikes: totalLikes / totalPosts,
        avgComments: totalComments / totalPosts,
        avgShares: totalShares / totalPosts,
        avgSaves: totalSaves / totalPosts,
        engagementRate: (totalLikes + totalComments + totalShares) / totalPosts,
      },
      sentiment: {
        overallScore: avgSentiment,
        positive: Math.max(0, avgSentiment) * 100,
        negative: Math.max(0, -avgSentiment) * 100,
        neutral: Math.max(0, 1 - Math.abs(avgSentiment)) * 100,
        comparative: avgSentiment * 5, // Scale to -5 to 5
      },
      mentalHealth: {
        interestScore,
        stressScore,
        moodScore: 50 + (avgSentiment * 25), // Scale -1 to 1 to 25-75 range
        energyLevel: Math.min(100, Math.max(0, 50 + (interestScore - 50) * 0.5)),
        socialSupport: Math.min(100, Math.max(0, 50 + (totalComments * 0.1))),
      },
      riskFactors: {
        total: 0,
        highRisk: 0,
        mediumRisk: 0,
        lowRisk: 0,
        riskLevel: 'none',
        examples: [],
      },
      byPlatform: [{
        platform: 'instagram',
        postCount: totalPosts,
        engagement: {
          likes: totalLikes,
          comments: totalComments,
          shares: totalShares,
          avgLikes: totalLikes / totalPosts,
          avgComments: totalComments / totalPosts,
          avgShares: totalShares / totalPosts,
        },
        sentiment: avgSentiment,
      }],
      trends: {
        daily: dailyTrends,
        weekly: [],
      },
    },
    postMetrics: postMetrics.map(p => p._id),
    summary,
  });
  
  return analysis.save();
}

// Main function to seed the database
async function seedDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/social_mh_analyzer', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    
    // Clear existing data
    console.log('Clearing existing data...');
    await Promise.all([
      User.deleteMany({}),
      SocialConnection.deleteMany({}),
      PostMetric.deleteMany({}),
      Analysis.deleteMany({}),
      CalendarEvent.deleteMany({}),
    ]);
    
    console.log('Database cleared');
    
    // Create demo user
    console.log('Creating demo user...');
    const demoUser = new User({
      name: 'Demo User',
      email: 'demo@example.com',
      password: await bcrypt.hash('demo1234', 10),
      dob: new Date('1995-01-01'),
      phone: '+15551234567',
      isUnder18: false,
      consent: true,
      role: 'user',
    });
    
    await demoUser.save();
    console.log(`Created demo user: ${demoUser.email}`);
    
    // Create social connection
    console.log('Creating social connection...');
    const socialConnection = new SocialConnection({
      userId: demoUser._id,
      provider: 'instagram',
      providerUserId: 'demo_instagram_user',
      accessToken: {
        encrypted: 'demo_access_token',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      },
      refreshToken: {
        encrypted: 'demo_refresh_token',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      },
      profile: {
        username: 'demo_user',
        displayName: 'Demo User',
        profilePicture: 'https://i.pravatar.cc/150?img=1',
        email: 'demo@example.com',
      },
      isActive: true,
      lastSynced: new Date(),
      syncStatus: 'completed',
      meta: {
        followers: 1000,
        following: 500,
        posts: 200,
      },
    });
    
    await socialConnection.save();
    console.log('Created social connection');
    
    // Generate post metrics
    console.log('Generating post metrics...');
    const postMetrics = await generatePostMetrics(demoUser._id, 100, {
      provider: 'instagram',
    });
    console.log(`Generated ${postMetrics.length} post metrics`);
    
    // Generate calendar events
    console.log('Generating calendar events...');
    const calendarEvents = await generateCalendarEvents(demoUser._id, 30);
    console.log(`Generated ${calendarEvents.length} calendar events`);
    
    // Generate analysis
    console.log('Generating analysis...');
    const analysis = await generateAnalysis(demoUser._id, postMetrics);
    console.log('Generated analysis');
    
    console.log('\nDatabase seeded successfully!');
    console.log('\nDemo credentials:');
    console.log('Email: demo@example.com');
    console.log('Password: demo1234');
    console.log('\nYou can now log in to the application with these credentials.');
    
    // Close the connection
    await mongoose.connection.close();
    process.exit(0);
    
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

// Run the seed function
seedDatabase();
