import mongoose, { Document, Schema } from 'mongoose';

// Channel interface
export interface IChannel {
  _id?: mongoose.Types.ObjectId;
  username: string;
  title: string;
  botToken?: string;
}

// Channel schema
const ChannelSchema = new Schema<IChannel>({
  username: {
    type: String,
    required: true,
    trim: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  botToken: {
    type: String,
    trim: true,
  }
}, { _id: true });

// AutoPosting Rule interface
export enum Frequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  CUSTOM = 'custom'
}

export enum TimeUnit {
  MINUTES = 'minutes',
  HOURS = 'hours',
  DAYS = 'days'
}

export interface IAutoPostingRule {
  _id?: mongoose.Types.ObjectId;
  name: string;
  topic: string;
  status: 'active' | 'inactive';
  frequency: Frequency;
  customInterval?: number;
  customTimeUnit?: TimeUnit;
  preferredTime?: string; // Format: "HH:MM"
  preferredDays?: string[]; // Array of weekdays: ['monday', 'wednesday', etc.]
  channelId: mongoose.Types.ObjectId | string;
  imageGeneration: boolean;
  keywords?: string[];
  buttons?: { text: string; url: string }[];
  imagePosition?: 'top' | 'bottom';
  sourceUrls?: string[]; // URLs to scrape content from
  avoidDuplication?: boolean; // Check for content duplication
  duplicateCheckDays?: number; // Number of days to check back for duplicates (default: 7)
  contentHistory?: string[]; // Store content summaries for duplicate checking
  nextScheduled?: Date | null;
  lastPublished?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// AutoPosting history interface
export interface IAutoPostingHistory {
  _id?: mongoose.Types.ObjectId;
  ruleId: mongoose.Types.ObjectId | string;
  ruleName: string;
  postId?: string;
  content?: string;
  imageUrl?: string;
  buttons?: { text: string; url: string }[];
  imagePosition?: 'top' | 'bottom';
  status: 'success' | 'failed';
  error?: string;
  publishedAt: Date;
}

// AutoPosting Rule schema
const AutoPostingRuleSchema = new Schema<IAutoPostingRule>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    topic: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    frequency: {
      type: String,
      enum: Object.values(Frequency),
      required: true,
    },
    customInterval: {
      type: Number,
      min: 1,
    },
    customTimeUnit: {
      type: String,
      enum: Object.values(TimeUnit),
    },
    preferredTime: {
      type: String,
      default: '12:00',
    },
    preferredDays: {
      type: [String],
      default: ['monday', 'wednesday', 'friday'],
    },
    channelId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    imageGeneration: {
      type: Boolean,
      default: true,
    },
    keywords: {
      type: [String],
      default: [],
    },
    buttons: {
      type: [{
        text: String,
        url: String
      }],
      default: [],
    },
    imagePosition: {
      type: String,
      enum: ['top', 'bottom'],
      default: 'bottom',
    },
    sourceUrls: {
      type: [String],
      default: [],
    },
    avoidDuplication: {
      type: Boolean,
      default: false,
    },
    duplicateCheckDays: {
      type: Number,
      default: 7,
    },
    contentHistory: {
      type: [String],
      default: [],
    },
    nextScheduled: {
      type: Date,
      default: null,
    },
    lastPublished: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    _id: true
  }
);

// AutoPosting history schema
const AutoPostingHistorySchema = new Schema<IAutoPostingHistory>(
  {
    ruleId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    ruleName: {
      type: String,
      required: true,
    },
    postId: {
      type: String,
    },
    content: {
      type: String,
    },
    imageUrl: {
      type: String,
    },
    buttons: {
      type: [{
        text: String,
        url: String
      }],
      default: [],
    },
    imagePosition: {
      type: String,
      enum: ['top', 'bottom'],
    },
    status: {
      type: String,
      enum: ['success', 'failed'],
      required: true,
    },
    error: {
      type: String,
    },
    publishedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: true
  }
);

// Draft interface
export interface IDraft {
  _id?: mongoose.Types.ObjectId;
  title: string;
  content: string;
  imageUrl?: string;
  imageUrls?: string[];
  tags?: string[];
  imagePosition?: string; // 'top' | 'bottom'
  buttons?: { text: string; url: string }[];
  createdAt: Date;
  updatedAt: Date;
}

// Draft schema
const DraftSchema = new Schema<IDraft>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
    },
    imageUrl: {
      type: String,
      trim: true,
    },
    imageUrls: {
      type: [String],
      default: [],
    },
    tags: {
      type: [String],
      default: [],
    },
    imagePosition: {
      type: String,
      enum: ['top', 'bottom'],
      default: 'top',
    },
    buttons: {
      type: [{
        text: String,
        url: String
      }],
      default: [],
    },
  },
  { 
    timestamps: true,
    _id: true 
  }
);

// Subscription types
export enum SubscriptionType {
  FREE = 'free',
  BASIC = 'basic',
  BUSINESS = 'business'
}

// Subscription interface
export interface ISubscription {
  type: SubscriptionType;
  startDate: Date;
  endDate: Date | null;
  isActive: boolean;
  paymentId?: string;
  downgradeOnExpiry?: boolean;
}

// Subscription schema
const SubscriptionSchema = new Schema<ISubscription>({
  type: {
    type: String,
    enum: Object.values(SubscriptionType),
    default: SubscriptionType.FREE,
    required: true
  },
  startDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  endDate: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  paymentId: {
    type: String
  },
  downgradeOnExpiry: {
    type: Boolean,
    default: false
  }
});

// User interface
export interface IUser extends Document {
  username: string;
  email: string;
  telegramId?: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
  channels: IChannel[];
  drafts?: IDraft[];
  autoPostingRules?: IAutoPostingRule[];
  autoPostingHistory?: IAutoPostingHistory[];
  subscription: ISubscription;
  aiCredits: number;
  totalCreditsUsed: number;
  creditsResetDate?: Date;
  storageUsed: number; // Хранилище, использованное для изображений (в байтах)
  createdAt: Date;
  updatedAt: Date;
}

// User schema
const UserSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    telegramId: {
      type: String,
      unique: true,
      sparse: true,
    },
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    photoUrl: {
      type: String,
    },
    channels: {
      type: [ChannelSchema],
      default: [],
    },
    drafts: {
      type: [DraftSchema],
      default: [],
    },
    autoPostingRules: {
      type: [AutoPostingRuleSchema],
      default: [],
    },
    autoPostingHistory: {
      type: [AutoPostingHistorySchema],
      default: [],
    },
    subscription: {
      type: SubscriptionSchema,
      default: () => ({
        type: SubscriptionType.FREE,
        startDate: new Date(),
        endDate: null,
        isActive: true
      })
    },
    aiCredits: {
      type: Number,
      default: 10 // Бесплатный план по умолчанию имеет 10 кредитов
    },
    totalCreditsUsed: {
      type: Number,
      default: 0
    },
    creditsResetDate: {
      type: Date,
      default: () => {
        const date = new Date();
        date.setMonth(date.getMonth() + 1);
        return date;
      }
    },
    storageUsed: {
      type: Number,
      default: 0 // Используемое хранилище в байтах
    }
  },
  {
    timestamps: true,
    collection: 'tgUsers',
  }
);

// Create and export User model
const User = mongoose.model<IUser>('User', UserSchema);
export default User; 