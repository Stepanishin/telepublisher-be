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