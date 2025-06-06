import mongoose, { Document, Schema } from 'mongoose';

export interface IScheduledPost extends Document {
  user: mongoose.Types.ObjectId;
  channelId: string;
  text: string;
  imageUrl?: string;
  imageUrls?: string[];
  tags: string[];
  scheduledDate: Date;
  published: boolean;
  imagePosition?: 'top' | 'bottom';
  buttons?: { text: string; url: string }[];
  createdAt: Date;
  updatedAt: Date;
}

const ScheduledPostSchema = new Schema<IScheduledPost>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    channelId: {
      type: String,
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    imageUrl: {
      type: String,
      required: false,
    },
    imageUrls: {
      type: [String],
      default: [],
    },
    tags: {
      type: [String],
      default: [],
    },
    scheduledDate: {
      type: Date,
      required: true,
    },
    published: {
      type: Boolean,
      default: false,
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
  }
);

export default mongoose.model<IScheduledPost>('ScheduledPost', ScheduledPostSchema); 