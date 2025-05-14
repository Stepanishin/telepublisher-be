import mongoose, { Document, Schema } from 'mongoose';

export interface IScheduledPoll extends Document {
  user: mongoose.Types.ObjectId;
  channelId: string;
  question: string;
  options: string[];
  isAnonymous: boolean;
  allowsMultipleAnswers: boolean;
  scheduledDate: Date;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ScheduledPollSchema = new Schema<IScheduledPoll>(
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
    question: {
      type: String,
      required: true,
    },
    options: {
      type: [String],
      required: true,
      validate: {
        validator: function(options: string[]) {
          return options.length >= 2 && options.length <= 10;
        },
        message: 'Poll must have between 2 and 10 options'
      }
    },
    isAnonymous: {
      type: Boolean,
      default: true,
    },
    allowsMultipleAnswers: {
      type: Boolean,
      default: false,
    },
    scheduledDate: {
      type: Date,
      required: true,
    },
    published: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IScheduledPoll>('ScheduledPoll', ScheduledPollSchema); 