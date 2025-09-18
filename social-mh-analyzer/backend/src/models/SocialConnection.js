import mongoose from 'mongoose';
import crypto from 'crypto';

// Encryption configuration
const algorithm = 'aes-256-cbc';
const iv = crypto.randomBytes(16); // Should be stored in env in production

// Function to encrypt tokens
const encrypt = (text) => {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is not set');
  }
  
  const cipher = crypto.createCipheriv(
    algorithm, 
    Buffer.from(process.env.ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
    iv
  );
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return { iv: iv.toString('hex'), content: encrypted };
};

// Function to decrypt tokens (not used in model, but available for use in routes)
const decrypt = (encrypted) => {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is not set');
  }
  
  const decipher = crypto.createDecipheriv(
    algorithm,
    Buffer.from(process.env.ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
    Buffer.from(encrypted.iv, 'hex')
  );
  
  let decrypted = decipher.update(encrypted.content, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

const socialConnectionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  provider: {
    type: String,
    required: [true, 'Provider name is required'],
    enum: ['instagram', 'facebook', 'twitter', 'youtube', 'tiktok', 'linkedin'],
    lowercase: true
  },
  providerUserId: {
    type: String,
    required: [true, 'Provider user ID is required']
  },
  accessToken: {
    encrypted: {
      iv: String,
      content: String
    },
    expiresAt: Date
  },
  refreshToken: {
    encrypted: {
      iv: String,
      content: String
    },
    expiresAt: Date
  },
  scope: [{
    type: String
  }],
  profile: {
    username: String,
    displayName: String,
    profilePicture: String,
    email: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastSynced: Date,
  syncStatus: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'failed'],
    default: 'pending'
  },
  lastError: String,
  meta: {
    followers: Number,
    following: Number,
    posts: Number
  },
  settings: {
    autoSync: {
      type: Boolean,
      default: false
    },
    syncFrequency: {
      type: String,
      enum: ['hourly', 'daily', 'weekly'],
      default: 'daily'
    },
    syncPosts: {
      type: Boolean,
      default: true
    },
    syncEngagement: {
      type: Boolean,
      default: true
    },
    syncMessages: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for faster lookups
socialConnectionSchema.index({ userId: 1, provider: 1 }, { unique: true });

// Pre-save hook to encrypt tokens
socialConnectionSchema.pre('save', function(next) {
  if (this.isModified('accessToken') && this.accessToken) {
    this.accessToken.encrypted = encrypt(this.accessToken);
  }
  
  if (this.isModified('refreshToken') && this.refreshToken) {
    this.refreshToken.encrypted = encrypt(this.refreshToken);
  }
  
  next();
});

// Instance method to decrypt tokens
socialConnectionSchema.methods.decryptAccessToken = function() {
  if (!this.accessToken || !this.accessToken.encrypted) return null;
  try {
    return decrypt(this.accessToken.encrypted);
  } catch (error) {
    console.error('Error decrypting access token:', error);
    return null;
  }
};

socialConnectionSchema.methods.decryptRefreshToken = function() {
  if (!this.refreshToken || !this.refreshToken.encrypted) return null;
  try {
    return decrypt(this.refreshToken.encrypted);
  } catch (error) {
    console.error('Error decrypting refresh token:', error);
    return null;
  }
};

// Virtual for token expiration status
socialConnectionSchema.virtual('isAccessTokenExpired').get(function() {
  if (!this.accessToken || !this.accessToken.expiresAt) return true;
  return new Date() > new Date(this.accessToken.expiresAt);
});

const SocialConnection = mongoose.model('SocialConnection', socialConnectionSchema);

export { SocialConnection, decrypt };
