import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { SocialConnection, decrypt } from '../models/SocialConnection.js';
import { protect } from './auth.js';

const router = express.Router();

// @desc    Get all connected social accounts for a user
// @route   GET /api/social/accounts
// @access  Private
router.get('/accounts', protect, async (req, res) => {
  try {
    const connections = await SocialConnection.find({ 
      userId: req.user._id,
      isActive: true 
    }).select('-accessToken.encrypted -refreshToken.encrypted');

    res.json(connections);
  } catch (error) {
    console.error('Error fetching social accounts:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Get available social media providers
// @route   GET /api/social/providers
// @access  Public
router.get('/providers', (req, res) => {
  const providers = [
    {
      id: 'instagram',
      name: 'Instagram',
      description: 'Connect your Instagram account to analyze your posts and engagement',
      requiresAuth: true,
      scopes: ['user_profile', 'user_media'],
      icon: 'instagram',
      status: 'available',
      authUrl: '/api/social/connect/instagram',
    },
    {
      id: 'twitter',
      name: 'Twitter',
      description: 'Connect your Twitter account to analyze your tweets and engagement',
      requiresAuth: true,
      scopes: ['tweet.read', 'users.read', 'offline.access'],
      icon: 'twitter',
      status: 'available',
      authUrl: '/api/social/connect/twitter',
    },
    {
      id: 'youtube',
      name: 'YouTube',
      description: 'Connect your YouTube account to analyze your video content',
      requiresAuth: true,
      scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
      icon: 'youtube',
      status: 'available',
      authUrl: '/api/social/connect/youtube',
    },
    {
      id: 'tiktok',
      name: 'TikTok',
      description: 'Connect your TikTok account to analyze your videos and engagement',
      requiresAuth: true,
      scopes: ['user.info.basic', 'video.list'],
      icon: 'tiktok',
      status: 'coming_soon',
      authUrl: null,
    },
    {
      id: 'manual',
      name: 'Manual Upload',
      description: 'Upload your social media data manually via CSV',
      requiresAuth: false,
      scopes: [],
      icon: 'upload',
      status: 'available',
      authUrl: null,
    },
  ];

  res.json(providers);
});

// @desc    Initiate OAuth connection to a social media provider
// @route   GET /api/social/connect/:provider
// @access  Private
router.get(
  '/connect/:provider',
  [
    param('provider')
      .isIn(['instagram', 'twitter', 'youtube', 'tiktok'])
      .withMessage('Invalid provider'),
  ],
  protect,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { provider } = req.params;
    const userId = req.user._id;

    try {
      // In a real implementation, this would redirect to the OAuth provider
      // For now, we'll just return a message with the next steps
      
      // Check if already connected
      const existingConnection = await SocialConnection.findOne({
        userId,
        provider,
        isActive: true,
      });

      if (existingConnection) {
        return res.status(400).json({
          message: `You have already connected your ${provider} account`,
          connection: existingConnection,
        });
      }

      // This is where you would typically redirect to the OAuth provider
      // For now, we'll simulate the OAuth flow with a manual connection
      
      res.json({
        message: `In a real implementation, this would redirect to ${provider} OAuth`,
        next: {
          method: 'POST',
          url: `/api/social/callback/${provider}`,
          body: {
            code: 'AUTH_CODE_FROM_PROVIDER',
            state: 'YOUR_STATE_PARAM',
          },
        },
        note: 'For development, you can manually create a connection using the /api/social/callback/:provider endpoint',
      });
    } catch (error) {
      console.error(`Error initiating ${provider} connection:`, error);
      res.status(500).json({ message: 'Server error during OAuth initiation' });
    }
  }
);

// @desc    OAuth callback for social media provider
// @route   GET /api/social/callback/:provider
// @access  Public (called by OAuth provider)
router.get(
  '/callback/:provider',
  [
    param('provider')
      .isIn(['instagram', 'twitter', 'youtube', 'tiktok'])
      .withMessage('Invalid provider'),
    body('code').optional().isString(),
    body('state').optional().isString(),
    body('error').optional().isString(),
    body('error_description').optional().isString(),
  ],
  protect,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { provider } = req.params;
    const { code, state, error, error_description } = req.query;
    const userId = req.user._id;

    // Handle OAuth errors
    if (error) {
      console.error(`OAuth error from ${provider}:`, error, error_description);
      return res.status(400).json({
        message: `Authorization failed: ${error_description || error}`,
        error,
        error_description,
      });
    }

    try {
      // In a real implementation, you would exchange the code for an access token
      // and fetch the user's profile from the provider's API
      
      // This is a simplified simulation of the OAuth flow
      const accessToken = `mock_${provider}_access_token_${Date.now()}`;
      const refreshToken = `mock_${provider}_refresh_token_${Date.now()}`;
      
      // Mock user profile data
      const profile = {
        id: `mock_${provider}_user_${Date.now()}`,
        username: req.user.name.toLowerCase().replace(/\s+/g, '') + `_${provider}`,
        displayName: `${req.user.name} (${provider})`,
        email: req.user.email,
        profilePicture: `https://ui-avatars.com/api/?name=${encodeURIComponent(req.user.name)}&background=random`,
      };

      // Check if connection already exists
      let connection = await SocialConnection.findOne({
        userId,
        provider,
        providerUserId: profile.id,
      });

      if (connection) {
        // Update existing connection
        connection.accessToken = accessToken;
        connection.refreshToken = refreshToken;
        connection.profile = profile;
        connection.isActive = true;
        connection.lastSynced = new Date();
        connection.syncStatus = 'completed';
      } else {
        // Create new connection
        connection = new SocialConnection({
          userId,
          provider,
          providerUserId: profile.id,
          accessToken: {
            encrypted: accessToken,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
          },
          refreshToken: {
            encrypted: refreshToken,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
          },
          profile,
          scope: ['read', 'write'],
          isActive: true,
          lastSynced: new Date(),
          syncStatus: 'completed',
          meta: {
            followers: Math.floor(Math.random() * 1000) + 100,
            following: Math.floor(Math.random() * 500) + 50,
            posts: Math.floor(Math.random() * 100) + 10,
          },
          settings: {
            autoSync: true,
            syncFrequency: 'daily',
            syncPosts: true,
            syncEngagement: true,
            syncMessages: false,
          },
        });
      }

      await connection.save();

      // Remove sensitive data from response
      const connectionData = connection.toObject();
      delete connectionData.accessToken;
      delete connectionData.refreshToken;

      // In a real app, you would redirect to a success page in your frontend
      res.json({
        success: true,
        message: `Successfully connected to ${provider}`,
        connection: connectionData,
      });
    } catch (error) {
      console.error(`Error in ${provider} callback:`, error);
      res.status(500).json({ 
        message: `Error connecting to ${provider}: ${error.message}`,
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// @desc    Disconnect a social media account
// @route   DELETE /api/social/connections/:id
// @access  Private
router.delete(
  '/connections/:id',
  [param('id').isMongoId().withMessage('Invalid connection ID')],
  protect,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user._id;

    try {
      const connection = await SocialConnection.findOne({
        _id: id,
        userId,
      });

      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }

      // In a real implementation, you would revoke the OAuth token with the provider
      // For now, we'll just mark it as inactive
      connection.isActive = false;
      connection.syncStatus = 'failed';
      connection.lastError = 'Manually disconnected by user';
      await connection.save();

      res.json({ 
        success: true, 
        message: 'Successfully disconnected account',
      });
    } catch (error) {
      console.error('Error disconnecting account:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// @desc    Get sync status for a connection
// @route   GET /api/social/connections/:id/sync
// @access  Private
router.get(
  '/connections/:id/sync',
  [param('id').isMongoId().withMessage('Invalid connection ID')],
  protect,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user._id;

    try {
      const connection = await SocialConnection.findOne({
        _id: id,
        userId,
      }).select('-accessToken.encrypted -refreshToken.encrypted');

      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }

      res.json({
        status: connection.syncStatus,
        lastSynced: connection.lastSynced,
        lastError: connection.lastError,
        nextSync: connection.nextSync,
        stats: {
          posts: connection.meta?.posts || 0,
          lastPostDate: connection.lastPostDate,
        },
      });
    } catch (error) {
      console.error('Error getting sync status:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

export { router as socialRoutes };

// In a real implementation, you would also have:
// - Webhook endpoints for real-time updates
// - Background jobs for syncing data
// - Token refresh logic
// - Rate limiting and error handling for API calls to social networks
// - Proper error handling for various OAuth failure scenarios
