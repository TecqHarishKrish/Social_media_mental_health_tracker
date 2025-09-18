// Helper functions for analyzing social media metrics
const { performance } = require('perf_hooks');

// Constants for score calculations
const SCORE_WEIGHTS = {
  LIKES: 0.4,
  COMMENTS: 0.3,
  SHARES: 0.2,
  SAVES: 0.05,
  WATCH_TIME: 0.05,
  SENTIMENT: 0.3,
  NEGATIVE: 0.5,
  FREQUENCY: 0.2
};

// Risk level thresholds (in percentage)
const RISK_THRESHOLDS = {
  HIGH: 70,
  MEDIUM: 40
};

// Cache for frequently accessed data
const analysisCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Validates input metrics
 * @param {Array} metrics - Array of post metrics
 * @throws {Error} If metrics are invalid
 */
function validateMetrics(metrics) {
  if (!Array.isArray(metrics)) {
    throw new Error('Metrics must be an array');
  }

  if (metrics.length === 0) {
    throw new Error('No metrics provided for analysis');
  }

  // Validate each metric object
  metrics.forEach((metric, index) => {
    if (!metric || typeof metric !== 'object') {
      throw new Error(`Invalid metric at index ${index}: must be an object`);
    }
    
    if (!metric.metrics || typeof metric.metrics !== 'object') {
      throw new Error(`Invalid metrics data at index ${index}: missing or invalid metrics object`);
    }
  });
}

/**
 * Cleans up cache periodically
 */
function cleanupCache() {
  const now = Date.now();
  for (const [key, { timestamp }] of analysisCache.entries()) {
    if (now - timestamp > CACHE_TTL) {
      analysisCache.delete(key);
    }
  }
}

// Set up periodic cache cleanup
setInterval(cleanupCache, CACHE_TTL).unref();

/**
 * Generates a cache key for metrics
 * @param {Array} metrics - Array of post metrics
 * @param {Object} options - Analysis options
 * @returns {string} Cache key
 */
function generateCacheKey(metrics, options) {
  const metricsKey = metrics
    .map(m => `${m._id || ''}:${m.timestamp || ''}`)
    .join('|');
  
  const optionsKey = JSON.stringify({
    timeRange: options.timeRange,
    startDate: options.startDate?.toISOString(),
    endDate: options.endDate?.toISOString()
  });
  
  return `${metricsKey}|${optionsKey}`;
}

/**
 * Analyzes metrics and returns comprehensive analysis
 * @param {Array} metrics - Array of post metrics
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Analysis results
 * @throws {Error} If analysis fails
 */
export async function analyzeMetrics(metrics, options = {}) {
  const startTime = performance.now();
  
  try {
    // Input validation
    validateMetrics(metrics);
    
    // Check cache first
    const cacheKey = generateCacheKey(metrics, options);
    const cachedResult = analysisCache.get(cacheKey);
    
    if (cachedResult) {
      return { 
        ...cachedResult.data,
        _cached: true,
        _processingTime: performance.now() - startTime 
      };
    }
    
    // Process metrics
    const result = await processMetrics(metrics, options);
    
    // Cache the result
    analysisCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
    
    return {
      ...result,
      _cached: false,
      _processingTime: performance.now() - startTime
    };
  } catch (error) {
    console.error('Analysis failed:', error);
    throw new Error(`Analysis failed: ${error.message}`);
  }
}

// Helper function to process metrics (separated for better testability)
async function processMetrics(metrics, options) {
  const { timeRange = '30d', startDate, endDate } = options;
  
  // Calculate basic statistics using parallel processing
  const [
    totalLikes,
    totalComments,
    totalShares,
    totalSaves,
    totalWatchTime
  ] = await Promise.all([
    sumMetric(metrics, 'likes'),
    sumMetric(metrics, 'comments'),
    sumMetric(metrics, 'shares'),
    sumMetric(metrics, 'saves'),
    sumMetric(metrics, 'watchTimeSeconds')
  ]);

  const totalPosts = metrics.length;
  const averages = calculateAverages(totalPosts, {
    totalLikes, totalComments, totalShares, totalSaves, totalWatchTime
  });
  
  // Calculate sentiment metrics
  const sentimentMetrics = calculateSentimentMetrics(metrics);
  
  // Calculate scores
  const interestScore = calculateInterestScore(averages);
  const stressScore = calculateStressScore({
    sentiment: sentimentMetrics.avgSentiment,
    negativePercentage: sentimentMetrics.negative,
    postFrequency: calculatePostFrequency(metrics, timeRange, startDate, endDate)
  });
  
  // Generate platform data and trends
  const platformData = generatePlatformData(metrics);
  const { dailyTrends } = generateTrends(metrics, startDate, endDate);
  
  // Detect risk factors
  const riskFactors = detectRiskFactors(metrics);
  
  // Generate summary
  const summary = generateSummary({
    interestScore,
    stressScore,
    riskFactors,
    platformData,
    dailyTrends
  });
  
  return {
    engagement: {
      totalPosts,
      totalLikes,
      totalComments,
      totalShares,
      totalSaves,
      totalWatchTime,
      ...averages,
      engagementRate: calculateEngagementRate(totalLikes, totalComments, totalShares, totalPosts)
    },
    sentiment: {
      ...sentimentMetrics,
      comparative: sentimentMetrics.avgSentiment * 5 // Scale to -5 to 5
    },
    mentalHealth: {
      interestScore,
      stressScore,
      moodScore: 50 + (sentimentMetrics.avgSentiment * 25), // Scale -1 to 1 to 25-75
      energyLevel: calculateEnergyLevel(interestScore),
      socialSupport: calculateSocialSupport(totalComments)
    },
    riskFactors,
    byPlatform: platformData,
    trends: { daily: dailyTrends, weekly: [] },
    summary
  };
}

// Helper functions for metric calculations
async function sumMetric(metrics, field) {
  return metrics.reduce((sum, m) => sum + (m.metrics[field] || 0), 0);
}

function calculateAverages(totalPosts, { totalLikes, totalComments, totalShares, totalSaves, totalWatchTime }) {
  return {
    avgLikes: totalPosts > 0 ? totalLikes / totalPosts : 0,
    avgComments: totalPosts > 0 ? totalComments / totalPosts : 0,
    avgShares: totalPosts > 0 ? totalShares / totalPosts : 0,
    avgSaves: totalPosts > 0 ? totalSaves / totalPosts : 0,
    avgWatchTime: totalPosts > 0 ? totalWatchTime / totalPosts : 0
  };
}

function calculateSentimentMetrics(metrics) {
  const sentimentScores = metrics
    .map(m => m.metrics.sentiment?.score ?? 0)
    .filter(score => score !== null && !isNaN(score));
  
  if (sentimentScores.length === 0) {
    return {
      avgSentiment: 0,
      positive: 0,
      negative: 0,
      neutral: 100
    };
  }
  
  const avgSentiment = sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length;
  const positive = (sentimentScores.filter(s => s > 0.1).length / sentimentScores.length) * 100 || 0;
  const negative = (sentimentScores.filter(s => s < -0.1).length / sentimentScores.length) * 100 || 0;
  
  return {
    avgSentiment,
    positive,
    negative,
    neutral: 100 - positive - negative
  };
}

function calculatePostFrequency(metrics, timeRange, startDate, endDate) {
  if (timeRange === 'custom' && startDate && endDate) {
    const days = (endDate - startDate) / (1000 * 60 * 60 * 24);
    return metrics.length / Math.max(1, days);
  }
  return metrics.length / (parseInt(timeRange) || 30);
}

function generatePlatformData(metrics) {
  const byPlatform = metrics.reduce((acc, metric) => {
    if (!acc[metric.provider]) {
      acc[metric.provider] = {
        count: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        sentimentSum: 0
      };
    }
    
    const platform = acc[metric.provider];
    platform.count++;
    platform.likes += metric.metrics.likes || 0;
    platform.comments += metric.metrics.comments || 0;
    platform.shares += metric.metrics.shares || 0;
    platform.sentimentSum += metric.metrics.sentiment?.score || 0;
    
    return acc;
  }, {});
  
  return Object.entries(byPlatform).map(([platform, data]) => ({
    platform,
    postCount: data.count,
    engagement: {
      likes: data.likes,
      comments: data.comments,
      shares: data.shares,
      avgLikes: data.likes / data.count,
      avgComments: data.comments / data.count,
      avgShares: data.shares / data.count
    },
    sentiment: data.sentimentSum / data.count
  }));
}

function generateTrends(metrics, startDate, endDate) {
  if (!startDate || !endDate) {
    return { dailyTrends: [], weeklyTrends: [] };
  }
  
  const dailyTrends = [];
  const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  
  for (let i = 0; i < days; i++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(currentDate.getDate() + i);
    
    const dayMetrics = metrics.filter(m => {
      const metricDate = new Date(m.timestamp);
      return metricDate.toDateString() === currentDate.toDateString();
    });
    
    if (dayMetrics.length > 0) {
      const daySentiment = dayMetrics.reduce(
        (sum, m) => sum + (m.metrics.sentiment?.score || 0), 0
      ) / dayMetrics.length;
      
      dailyTrends.push({
        date: currentDate.toISOString().split('T')[0],
        postCount: dayMetrics.length,
        sentiment: daySentiment,
        engagement: {
          likes: dayMetrics.reduce((sum, m) => sum + (m.metrics.likes || 0), 0),
          comments: dayMetrics.reduce((sum, m) => sum + (m.metrics.comments || 0), 0),
          shares: dayMetrics.reduce((sum, m) => sum + (m.metrics.shares || 0), 0)
        }
      });
    }
  }
  
  // Generate weekly trends (group by week)
  const weeklyTrends = [];
  // Implementation left as an exercise - similar to daily but group by week
  
  return { dailyTrends, weeklyTrends };
}

function calculateEngagementRate(likes, comments, shares, totalPosts) {
  return totalPosts > 0 ? (likes + comments + shares) / totalPosts : 0;
}

function calculateEnergyLevel(interestScore) {
  return Math.min(100, Math.max(0, 50 + (interestScore - 50) * 0.5));
}

function calculateSocialSupport(comments) {
  return Math.min(100, Math.max(0, 50 + (comments * 0.1)));
}

/**
 * Detects risk factors in post content
 * @param {Array} metrics - Array of post metrics
 * @returns {Object} Risk analysis
 */
function detectRiskFactors(metrics) {
  if (!metrics || !metrics.length) {
    return {
      total: 0,
      highRisk: 0,
      mediumRisk: 0,
      lowRisk: 0,
      riskLevel: 'none',
      examples: []
    };
  }
    // Categorize risk keywords by severity
  const RISK_KEYWORDS = {
    high: [
      'suicide', 'kill myself', 'end my life', 'suicidal',
      'self-harm', 'self harm', 'cutting', 'want to die'
    ],
    medium: [
      'hopeless', 'can\'t go on', 'tired of life',
      'no reason to live', 'give up'
    ],
    low: [
      'depressed', 'anxious', 'overwhelmed', 'lonely',
      'alone', 'nobody cares', 'no one cares', 'worthless',
      'useless', 'failure', 'hate myself', 'disappointed in myself'
    ]
  };

  // Pre-compile regex patterns for better performance
  const riskPatterns = {
    high: new RegExp(`\\b(${RISK_KEYWORDS.high.join('|')})\\b`, 'gi'),
    medium: new RegExp(`\\b(${RISK_KEYWORDS.medium.join('|')})\\b`, 'gi'),
    low: new RegExp(`\\b(${RISK_KEYWORDS.low.join('|')})\\b`, 'gi')
  };

  const riskPosts = [];
  const processedTexts = new Set(); // To avoid duplicate processing
  
  // Process each metric for risk factors
  for (const metric of metrics) {
    try {
      if (!metric?.text || processedTexts.has(metric.text)) {
        continue;
      }

      const text = metric.text.toLowerCase();
      const matches = {
        high: [],
        medium: [],
        low: []
      };

      // Check for each risk level
      let severity = 'none';
      
      // Check high risk patterns first
      const highMatches = text.match(riskPatterns.high);
      if (highMatches?.length) {
        matches.high = [...new Set(highMatches)]; // Remove duplicates
        severity = 'high';
      }
      
      // Only check medium if no high risk found
      if (severity === 'none') {
        const mediumMatches = text.match(riskPatterns.medium);
        if (mediumMatches?.length) {
          matches.medium = [...new Set(mediumMatches)];
          severity = 'medium';
        }
      }
      
      // Only check low if no higher risks found
      if (severity === 'none') {
        const lowMatches = text.match(riskPatterns.low);
        if (lowMatches?.length) {
          matches.low = [...new Set(lowMatches)];
          severity = 'low';
        }
      }

      if (severity !== 'none') {
        const allMatches = [
          ...matches.high,
          ...matches.medium,
          ...matches.low
        ];
        
        riskPosts.push({
          id: metric._id,
          text: metric.text.length > 200 
            ? `${metric.text.substring(0, 200)}...` 
            : metric.text,
          timestamp: metric.timestamp,
          matches: allMatches,
          severity,
          context: getContextAroundKeywords(metric.text, allMatches)
        });
        
        processedTexts.add(metric.text);
      }
    } catch (error) {
      console.error('Error processing metric for risk factors:', error);
      // Continue with next metric even if one fails
    }
  }
  
  // Group by risk level with additional analysis
  const highRisk = riskPosts.filter(p => p.severity === 'high');
  const mediumRisk = riskPosts.filter(p => p.severity === 'medium');
  const lowRisk = riskPosts.filter(p => p.severity === 'low');
  
  // Determine overall risk level
  let riskLevel = 'none';
  if (highRisk.length > 0) {
    riskLevel = 'high';
  } else if (mediumRisk.length >= 3) { // Multiple medium risks could be concerning
    riskLevel = 'medium-high';
  } else if (mediumRisk.length > 0) {
    riskLevel = 'medium';
  } else if (lowRisk.length >= 5) { // Many low risks might indicate an issue
    riskLevel = 'low-medium';
  } else if (lowRisk.length > 0) {
    riskLevel = 'low';
  }
  
  // Get top examples, prioritizing higher severity and more recent posts
  const sortedExamples = [...riskPosts]
    .sort((a, b) => {
      // First sort by severity
      const severityOrder = { high: 3, medium: 2, low: 1 };
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      
      if (severityDiff !== 0) return severityDiff;
      
      // Then by number of matches
      const matchDiff = b.matches.length - a.matches.length;
      if (matchDiff !== 0) return matchDiff;
      
      // Finally by recency
      return new Date(b.timestamp) - new Date(a.timestamp);
    })
    .slice(0, 5); // Limit to top 5 examples
  
  // Calculate risk scores (0-100)
  const riskScores = {
    high: highRisk.length * 10, // Each high risk adds 10 points
    medium: mediumRisk.length * 3, // Each medium adds 3 points
    low: lowRisk.length * 1 // Each low adds 1 point
  };
  
  const totalRiskScore = Math.min(
    Object.values(riskScores).reduce((sum, score) => sum + score, 0),
    100 // Cap at 100
  );
  
  return {
    total: riskPosts.length,
    highRisk: highRisk.length,
    mediumRisk: mediumRisk.length,
    lowRisk: lowRisk.length,
    riskLevel,
    riskScore: totalRiskScore,
    examples: sortedExamples,
    summary: generateRiskSummary({
      riskLevel,
      highRiskCount: highRisk.length,
      mediumRiskCount: mediumRisk.length,
      lowRiskCount: lowRisk.length,
      totalScore: totalRiskScore
    })
  };
}

/**
 * Generates a human-readable risk summary
 */
function generateRiskSummary({
  riskLevel,
  highRiskCount,
  mediumRiskCount,
  lowRiskCount,
  totalScore
}) {
  const summaries = [];
  const recommendations = [];
  
  // Add severity summary
  if (highRiskCount > 0) {
    summaries.push(`${highRiskCount} high-risk indicators found`);
    recommendations.push(
      'Immediate attention recommended. Consider reaching out to a mental health professional.'
    );
  }
  
  if (mediumRiskCount > 0) {
    summaries.push(`${mediumRiskCount} medium-risk indicators found`);
    if (riskLevel === 'medium-high') {
      recommendations.push(
        'Multiple concerning indicators detected. Monitoring is advised.'
      );
    }
  }
  
  if (lowRiskCount > 0) {
    summaries.push(`${lowRiskCount} low-risk indicators found`);
    if (riskLevel === 'low-medium') {
      recommendations.push(
        'Several low-risk indicators detected. Consider monitoring for changes.'
      );
    }
  }
  
  // Add overall assessment
  let assessment = 'No significant risk indicators detected.';
  if (riskLevel === 'high') {
    assessment = 'High risk level detected. Immediate attention is recommended.';
  } else if (riskLevel === 'medium-high') {
    assessment = 'Moderate to high risk level detected. Close monitoring is advised.';
  } else if (riskLevel === 'medium') {
    assessment = 'Moderate risk level detected. Consider monitoring for changes.';
  } else if (riskLevel === 'low-medium') {
    assessment = 'Low to moderate risk level detected.';
  } else if (riskLevel === 'low') {
    assessment = 'Low risk level detected. No immediate action needed.';
  }
  
  return {
    summary: summaries.length > 0 ? summaries.join(', ') : 'No risk indicators found',
    assessment,
    recommendations: recommendations.length > 0 
      ? recommendations 
      : ['No specific recommendations at this time.'],
    riskScore: totalScore,
    riskLevel
  };
}

/**
 * Extracts context around keywords in text
 */
function getContextAroundKeywords(text, keywords, contextWords = 10) {
  if (!text || !keywords?.length) return [];
  
  const words = text.split(/\s+/);
  const contextSnippets = [];
  
  for (const keyword of keywords) {
    const keywordLower = keyword.toLowerCase();
    const keywordIndex = words.findIndex(word => 
      word.toLowerCase().includes(keywordLower)
    );
    
    if (keywordIndex !== -1) {
      const start = Math.max(0, keywordIndex - contextWords);
      const end = Math.min(words.length, keywordIndex + contextWords + 1);
      const snippet = words.slice(start, end).join(' ');
      
      // Highlight the keyword in the snippet
      const highlightedSnippet = snippet.replace(
        new RegExp(`(${keyword})`, 'gi'),
        '<strong>$1</strong>'
      );
      
      contextSnippets.push({
        keyword,
        snippet: highlightedSnippet,
        position: `${Math.round((keywordIndex / words.length) * 100)}%`
      });
    }
  }
  
  return contextSnippets;
}

/**
 * Generates a human-readable summary of the analysis
 * @param {Object} params - Analysis parameters
 * @param {number} params.interestScore - Calculated interest score
 * @param {number} params.stressScore - Calculated stress score
 * @param {Object} params.riskFactors - Risk factors analysis
 * @param {Array} params.platformData - Platform-specific metrics
 * @param {Array} params.dailyTrends - Daily trend data
 * @returns {Object} Summary object with key findings and recommendations
 */
function generateSummary({ interestScore, stressScore, riskFactors, platformData, dailyTrends }) {
  const interestCategory = getInterestCategory(interestScore);
  const stressCategory = getStressCategory(stressScore);
  
  const keyFindings = [];
  const recommendations = [];
  const positiveAspects = [];
  const areasOfConcern = [];
  
  // Interest level summary
  if (interestCategory === 'high') {
    keyFindings.push('Your engagement level is high, indicating strong interest in your social media content.');
    positiveAspects.push('High engagement with your content');
  } else if (interestCategory === 'moderate') {
    keyFindings.push('Your engagement level is moderate. There is room for increased interaction.');
  } else {
    keyFindings.push('Your engagement level is lower than average. Consider experimenting with different types of content.');
    recommendations.push('Try posting at different times or using different content formats to increase engagement.');
  }
  
  // Stress level summary
  if (stressCategory === 'high') {
    keyFindings.push('Your stress indicators are elevated. Consider taking breaks from social media.');
    areasOfConcern.push('Elevated stress levels');
    recommendations.push('Consider implementing digital wellness practices like screen time limits or mindfulness exercises.');
  } else if (stressCategory === 'moderate') {
    keyFindings.push('Your stress levels appear to be within a moderate range.');
    recommendations.push('Be mindful of your social media usage to maintain healthy stress levels.');
  } else {
    keyFindings.push('Your stress levels appear to be well-managed.');
    positiveAspects.push('Healthy stress management');
  }
  
  // Risk factors
  if (riskFactors.highRisk > 0) {
    keyFindings.push(`We've detected ${riskFactors.highRisk} posts with concerning content that may indicate distress.`);
    areasOfConcern.push('Concerning content in posts');
    recommendations.push('Consider reaching out to a mental health professional for support.');
  } else if (riskFactors.mediumRisk > 0) {
    keyFindings.push(`We've detected ${riskFactors.mediumRisk} posts that may indicate some emotional distress.`);
    recommendations.push('Be mindful of your emotional well-being and consider talking to someone if you\'re feeling overwhelmed.');
  }
  
  // Platform-specific insights
  if (platformData.length > 0) {
    const topPlatform = platformData.reduce((max, platform) => 
      platform.engagement.avgLikes > max.engagement.avgLikes ? platform : max
    , platformData[0]);
    
    keyFindings.push(`Your highest engagement is on ${topPlatform.platform} with an average of ${Math.round(topPlatform.engagement.avgLikes)} likes per post.`);
    
    if (platformData.length > 1) {
      recommendations.push(`Consider focusing on the content strategies that work well on ${topPlatform.platform} for other platforms.`);
    }
  }
  
  // Time-based trends
  if (dailyTrends.length > 1) {
    const daysWithPosts = dailyTrends.length;
    const totalPosts = dailyTrends.reduce((sum, day) => sum + day.postCount, 0);
    const avgPostsPerDay = totalPosts / daysWithPosts;
    
    if (avgPostsPerDay > 5) {
      keyFindings.push(`You're posting an average of ${Math.round(avgPostsPerDay)} times per day, which is quite frequent.`);
      recommendations.push('Consider quality over quantity - fewer, more meaningful posts often perform better.');
    }
  }
  
  return {
    overall: `Your social media engagement is ${interestCategory}, and your stress levels appear ${stressCategory}.`,
    keyFindings,
    recommendations: recommendations.length > 0 ? recommendations : [
      'Your social media habits appear balanced. Keep up the good work!',
    ],
    positiveAspects: positiveAspects.length > 0 ? positiveAspects : [
      'No significant areas of concern detected',
    ],
    areasOfConcern: areasOfConcern.length > 0 ? areasOfConcern : [
      'No significant areas of concern detected',
    ],
  };
}

/**
 * Categorizes interest score
 * @param {number} score - Interest score (0-100)
 * @returns {string} Category
 */
function getInterestCategory(score) {
  if (score >= 75) return 'high';
  if (score >= 40) return 'moderate';
  return 'low';
}

/**
 * Categorizes stress score
 * @param {number} score - Stress score (0-100)
 * @returns {string} Category
 */
function getStressCategory(score) {
  if (score >= 70) return 'high';
  if (score >= 40) return 'moderate';
  return 'low';
}

/**
 * Formats analysis for report
 * @param {Object} analysis - Analysis object
 * @returns {Object} Formatted report
 */
export function formatAnalysisReport(analysis) {
  const { metrics, ...analysisData } = analysis.toObject();
  
  return {
    ...analysisData,
    metrics: {
      ...metrics,
      // Format numbers for display
      engagement: metrics.engagement ? {
        ...metrics.engagement,
        avgLikes: Math.round(metrics.engagement.avgLikes * 100) / 100,
        avgComments: Math.round(metrics.engagement.avgComments * 100) / 100,
        avgShares: Math.round(metrics.engagement.avgShares * 100) / 100,
        avgSaves: Math.round(metrics.engagement.avgSaves * 100) / 100,
        avgWatchTime: Math.round(metrics.engagement.avgWatchTime * 100) / 100,
        engagementRate: Math.round(metrics.engagement.engagementRate * 100) / 100,
      } : {},
      sentiment: metrics.sentiment ? {
        ...metrics.sentiment,
        overallScore: Math.round(metrics.sentiment.overallScore * 100) / 100,
        positive: Math.round(metrics.sentiment.positive * 10) / 10,
        negative: Math.round(metrics.sentiment.negative * 10) / 10,
        neutral: Math.round(metrics.sentiment.neutral * 10) / 10,
        comparative: Math.round(metrics.sentiment.comparative * 10) / 10,
      } : {},
      mentalHealth: metrics.mentalHealth ? {
        ...metrics.mentalHealth,
        interestScore: Math.round(metrics.mentalHealth.interestScore * 10) / 10,
        stressScore: Math.round(metrics.mentalHealth.stressScore * 10) / 10,
        moodScore: Math.round(metrics.mentalHealth.moodScore * 10) / 10,
        energyLevel: Math.round(metrics.mentalHealth.energyLevel * 10) / 10,
        socialSupport: Math.round(metrics.mentalHealth.socialSupport * 10) / 10,
      } : {},
      byPlatform: metrics.byPlatform ? metrics.byPlatform.map(platform => ({
        ...platform,
        sentiment: Math.round(platform.sentiment * 100) / 100,
        engagement: {
          ...platform.engagement,
          avgLikes: Math.round(platform.engagement.avgLikes * 100) / 100,
          avgComments: Math.round(platform.engagement.avgComments * 100) / 100,
          avgShares: Math.round(platform.engagement.avgShares * 100) / 100,
        },
      })) : [],
    },
  };
}
