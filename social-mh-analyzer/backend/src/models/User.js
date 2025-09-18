import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide your name'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Please provide your email'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: [8, 'Password must be at least 8 characters long'],
    select: false
  },
  dob: {
    type: Date,
    required: [true, 'Please provide your date of birth']
  },
  phone: {
    type: String,
    trim: true
  },
  parentPhone: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        // If user is under 18, parentPhone is required
        if (this.isUnder18) {
          return v && v.length > 0;
        }
        return true;
      },
      message: 'Parent/guardian phone number is required for users under 18'
    }
  },
  isUnder18: {
    type: Boolean,
    default: function() {
      if (!this.dob) return false;
      const today = new Date();
      const birthDate = new Date(this.dob);
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age < 18;
    }
  },
  consent: {
    type: Boolean,
    required: [true, 'You must agree to the terms and privacy policy'],
    validate: {
      validator: function(v) {
        return v === true;
      },
      message: 'You must agree to the terms and privacy policy'
    }
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  lastLogin: {
    type: Date
  },
  accountStatus: {
    type: String,
    enum: ['active', 'suspended', 'deleted'],
    default: 'active'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Virtual for user's age
userSchema.virtual('age').get(function() {
  if (!this.dob) return null;
  const today = new Date();
  const birthDate = new Date(this.dob);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});

// Update isUnder18 when dob changes
userSchema.pre('save', function(next) {
  if (this.isModified('dob')) {
    this.isUnder18 = this.age < 18;
  }
  next();
});

// Pre-remove middleware to handle related data
userSchema.pre('remove', async function(next) {
  // Remove related data (implement these models)
  // await this.model('SocialConnection').deleteMany({ userId: this._id });
  // await this.model('PostMetric').deleteMany({ userId: this._id });
  // await this.model('Analysis').deleteMany({ userId: this._id });
  // await this.model('CalendarEvent').deleteMany({ userId: this._id });
  next();
});

const User = mongoose.model('User', userSchema);

export default User;
