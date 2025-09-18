import Sentiment from 'sentiment';

const sentiment = new Sentiment();

// Configuration for scoring
const SCORE_WEIGHTS = {
  likes: 0.4,
  comments: 0.3,
  shares: 0.2,
  saves: 0.1,
  watchTime: 0.2,
};

const STRESS_WEIGHTS = {
  negativeSentiment: 0.6,
  postFrequency: 0.2,
  negativeWordDensity: 0.2,
};

const RISK_KEYWORDS = [
  'suicide', 'kill myself', 'end my life', 'hopeless', 'don\'t want to live',
  'depressed', 'anxious', 'overwhelmed', 'can\'t go on', 'tired of life',
  'self-harm', 'self harm', 'cutting', 'suicidal', 'want to die',
  'lonely', 'alone', 'nobody cares', 'no one cares', 'worthless',
  'useless', 'failure', 'hate myself', 'disappointed in myself',
];

/**
 * Analyze sentiment of a text
 * @param {string} text - The text to analyze
 * @returns {Object} Sentiment analysis result
 */
export function analyzeSentiment(text) {
  if (!text || typeof text !== 'string') {
    return {
      score: 0,
      comparative: 0,
      tokens: [],
      words: [],
      positive: [],
      negative: [],
    };
  }
  
  return sentiment.analyze(text);
}

/**
 * Calculate interest score based on engagement metrics
 * @param {Object} metrics - Engagement metrics
 * @param {number} metrics.likes - Number of likes
 * @param {number} metrics.comments - Number of comments
 * @param {number} metrics.shares - Number of shares
 * @param {number} metrics.saves - Number of saves
 * @param {number} metrics.watchTime - Watch time in seconds (for video content)
 * @returns {number} Interest score (0-100)
 */
export function calculateInterestScore({
  likes = 0,
  comments = 0,
  shares = 0,
  saves = 0,
  watchTime = 0,
}) {
  // Normalize values (these caps can be adjusted based on your platform's average)
  const normalizedLikes = Math.min(likes / 100, 1);
  const normalizedComments = Math.min(comments / 10, 1);
  const normalizedShares = Math.min(shares / 5, 1);
  const normalizedSaves = Math.min(saves / 20, 1);
  const normalizedWatchTime = Math.min(watchTime / 300, 1); // 5 minutes max

  // Calculate weighted score
  const score = (
    normalizedLikes * SCORE_WEIGHTS.likes +
    normalizedComments * SCORE_WEIGHTS.comments +
    normalizedShares * SCORE_WEIGHTS.shares +
    normalizedSaves * SCORE_WEIGHTS.saves +
    normalizedWatchTime * SCORE_WEIGHTS.watchTime
  ) * 100; // Convert to 0-100 scale

  // Ensure score is within bounds
  return Math.min(Math.max(score, 0), 100);
}

/**
 * Calculate stress score based on various factors
 * @param {Object} params - Parameters for stress calculation
 * @param {number} params.sentiment - Average sentiment score (-1 to 1)
 * @param {number} params.negativePercentage - Percentage of negative content
 * @param {number} params.postFrequency - Posts per day
 * @param {Array} [params.posts=[]] - Array of post texts for deeper analysis
 * @returns {number} Stress score (0-100)
 */
export function calculateStressScore({
  sentiment = 0,
  negativePercentage = 0,
  postFrequency = 0,
  posts = [],
}) {
  // Normalize sentiment to 0-1 scale (0 = most negative, 1 = most positive)
  const normalizedSentiment = (sentiment + 1) / 2; // Convert -1 to 1 range to 0-1
  
  // Calculate negative content score (0-1)
  const negativeContentScore = negativePercentage / 100;
  
  // Calculate post frequency score (0-1)
  // More than 10 posts per day is considered high frequency
  const normalizedPostFrequency = Math.min(postFrequency / 10, 1);
  
  // Calculate risk keyword density if posts are provided
  let riskKeywordDensity = 0;
  if (posts.length > 0) {
    const totalWords = posts.reduce((sum, post) => {
      if (!post || typeof post !== 'string') return sum;
      return sum + post.split(/\s+/).length;
    }, 0);
    
    if (totalWords > 0) {
      const riskWordCount = posts.reduce((sum, post) => {
        if (!post || typeof post !== 'string') return sum;
        const words = post.toLowerCase().split(/\s+/);
        return sum + words.filter(word => RISK_KEYWORDS.includes(word)).length;
      }, 0);
      
      riskKeywordDensity = Math.min(riskWordCount / totalWords, 1);
    }
  }
  
  // Calculate stress score using weighted sum
  const stressScore = (
    (1 - normalizedSentiment) * STRESS_WEIGHTS.negativeSentiment +
    negativeContentScore * STRESS_WEIGHTS.negativeWordDensity +
    normalizedPostFrequency * STRESS_WEIGHTS.postFrequency +
    riskKeywordDensity * 0.3 // Additional weight for risk keywords
  ) * 100; // Convert to 0-100 scale
  
  // Ensure score is within bounds
  return Math.min(Math.max(stressScore, 0), 100);
}

/**
 * Analyze a single post for risk factors
 * @param {Object} post - Post data
 * @param {string} post.text - Post content
 * @param {string} [post.platform] - Platform the post is from
 * @returns {Object} Analysis result
 */
export function analyzePost(post) {
  if (!post || typeof post !== 'object') {
    return {
      score: 0,
      riskLevel: 'none',
      riskFactors: [],
      sentiment: { score: 0, comparative: 0 },
    };
  }
  
  const text = post.text || '';
  const sentiment = analyzeSentiment(text);
  
  // Check for risk keywords
  const riskKeywords = RISK_KEYWORDS.filter(keyword => 
    text.toLowerCase().includes(keyword)
  );
  
  // Calculate risk level
  let riskLevel = 'none';
  const highRiskWords = ['suicide', 'kill myself', 'end my life', 'self-harm', 'self harm', 'suicidal'];
  const mediumRiskWords = ['hopeless', 'want to die', 'tired of life', 'can\'t go on', 'depressed'];
  
  if (riskKeywords.some(kw => highRiskWords.includes(kw))) {
    riskLevel = 'high';
  } else if (riskKeywords.some(kw => mediumRiskWords.includes(kw))) {
    riskLevel = 'medium';
  } else if (riskKeywords.length > 0) {
    riskLevel = 'low';
  }
  
  // Calculate a risk score (0-100)
  let riskScore = 0;
  if (riskLevel === 'high') riskScore = 75 + (Math.random() * 25); // 75-100
  else if (riskLevel === 'medium') riskScore = 40 + (Math.random() * 35); // 40-75
  else if (riskLevel === 'low') riskScore = 10 + (Math.random() * 30); // 10-40
  
  return {
    score: riskScore,
    riskLevel,
    riskKeywords,
    sentiment: {
      score: sentiment.score,
      comparative: sentiment.comparative,
      positive: sentiment.positive,
      negative: sentiment.negative,
    },
    timestamp: post.timestamp || new Date(),
  };
}

/**
 * Generate a summary of the analysis
 * @param {Object} metrics - Analysis metrics
 * @param {number} metrics.interestScore - Interest score (0-100)
 * @param {number} metrics.stressScore - Stress score (0-100)
 * @param {Array} metrics.riskFactors - Array of risk factors
 * @returns {Object} Summary object
 */
export function generateSummary({ interestScore, stressScore, riskFactors = [] }) {
  const interestLevel = getInterestLevel(interestScore);
  const stressLevel = getStressLevel(stressScore);
  
  return {
    interest: {
      score: interestScore,
      level: interestLevel,
      description: getInterestDescription(interestLevel),
    },
    stress: {
      score: stressScore,
      level: stressLevel,
      description: getStressDescription(stressLevel),
    },
    risk: {
      level: riskFactors.length > 0 ? 'elevated' : 'normal',
      factors: riskFactors,
      description: riskFactors.length > 0
        ? `Found ${riskFactors.length} potential risk factors`
        : 'No significant risk factors detected',
    },
    recommendations: generateRecommendations(interestLevel, stressLevel, riskFactors),
  };
}

// Helper functions
function getInterestLevel(score) {
  if (score >= 75) return 'high';
  if (score >= 40) return 'moderate';
  return 'low';
}

function getStressLevel(score) {
  if (score >= 70) return 'high';
  if (score >= 30) return 'moderate';
  return 'low';
}

function getInterestDescription(level) {
  const descriptions = {
    high: 'Your engagement levels are high, indicating strong interest in your content.',
    moderate: 'Your engagement levels are moderate. There is room for increased interaction.',
    low: 'Your engagement levels are lower than average. Consider experimenting with different types of content.',
  };
  return descriptions[level] || '';
}

function getStressDescription(level) {
  const descriptions = {
    high: 'Your stress indicators are elevated. Consider taking breaks from social media.',
    moderate: 'Your stress levels are within a moderate range. Be mindful of your social media usage.',
    low: 'Your stress levels appear to be well-managed.',
  };
  return descriptions[level] || '';
}

function generateRecommendations(interestLevel, stressLevel, riskFactors) {
  const recommendations = [];
  
  // Interest-based recommendations
  if (interestLevel === 'high') {
    recommendations.push('Maintain your current posting schedule as it seems to be working well.');
  } else if (interestLevel === 'moderate') {
    recommendations.push('Try posting at different times or using different content formats to increase engagement.');
  } else {
    recommendations.push('Consider analyzing your top-performing content and creating more like it.');
    recommendations.push('Engage with your audience by responding to comments and messages.');
  }
  
  // Stress-based recommendations
  if (stressLevel === 'high') {
    recommendations.push('Consider implementing digital wellness practices like screen time limits or mindfulness exercises.');
    recommendations.push('Take regular breaks from social media to reduce stress.');
  } else if (stressLevel === 'moderate') {
    recommendations.push('Be mindful of your social media usage to maintain healthy stress levels.');
  }
  
  // Risk-based recommendations
  if (riskFactors.length > 0) {
    recommendations.push('We\'ve detected some concerning content. Consider reaching out to a mental health professional for support.');
    recommendations.push('You\'re not alone. If you\'re feeling overwhelmed, consider talking to someone you trust.');
  }
  
  // General recommendations
  if (recommendations.length < 3) {
    recommendations.push('Maintain a healthy balance between online and offline activities.');
    recommendations.push('Engage with positive and supportive communities online.');
  }
  
  return recommendations;
}

/**
 * Process a batch of posts and return analysis results
 * @param {Array} posts - Array of post objects with text content
 * @returns {Object} Analysis results
 */
export function analyzePosts(posts) {
  if (!Array.isArray(posts)) {
    throw new Error('Posts must be an array');
  }
  
  const results = {
    totalPosts: posts.length,
    analyzedPosts: 0,
    sentimentScores: [],
    riskLevels: {
      high: 0,
      medium: 0,
      low: 0,
      none: 0,
    },
    riskKeywords: {},
    posts: [],
  };
  
  // Analyze each post
  posts.forEach((post, index) => {
    try {
      const analysis = analyzePost(post);
      results.analyzedPosts++;
      results.sentimentScores.push(analysis.sentiment.score);
      results.riskLevels[analysis.riskLevel]++;
      
      // Track risk keywords
      analysis.riskKeywords.forEach(keyword => {
        results.riskKeywords[keyword] = (results.riskKeywords[keyword] || 0) + 1;
      });
      
      // Store analysis with post
      results.posts.push({
        id: post.id || `post-${index}`,
        text: post.text,
        timestamp: post.timestamp || new Date(),
        platform: post.platform || 'unknown',
        analysis,
      });
    } catch (error) {
      console.error(`Error analyzing post ${index}:`, error);
    }
  });
  
  // Calculate averages
  results.avgSentiment = results.sentimentScores.length > 0
    ? results.sentimentScores.reduce((a, b) => a + b, 0) / results.sentimentScores.length
    : 0;
    
  // Sort risk keywords by frequency
  results.sortedRiskKeywords = Object.entries(results.riskKeywords)
    .sort((a, b) => b[1] - a[1])
    .map(([keyword, count]) => ({ keyword, count }));
  
  // Calculate overall risk level
  if (results.riskLevels.high > 0) {
    results.overallRiskLevel = 'high';
  } else if (results.riskLevels.medium > 0) {
    results.overallRiskLevel = 'medium';
  } else if (results.riskLevels.low > 0) {
    results.overallRiskLevel = 'low';
  } else {
    results.overallRiskLevel = 'none';
  }
  
  return results;
}

export default {
  analyzeSentiment,
  calculateInterestScore,
  calculateStressScore,
  analyzePost,
  generateSummary,
  analyzePosts,
};
