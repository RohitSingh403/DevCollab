import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

const notificationPreferenceSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    assignments: { type: Boolean, default: true },
    comments: { type: Boolean, default: true },
    mentions: { type: Boolean, default: true },
    status: { type: Boolean, default: true },
    blockers: { type: Boolean, default: true },
    reminders: { type: Boolean, default: true },
  },
  { timestamps: false },
);

export type NotificationPreferenceDocument = InferSchemaType<typeof notificationPreferenceSchema> & { _id: Schema.Types.ObjectId };

export const NotificationPreference =
  (models.NotificationPreference as Model<NotificationPreferenceDocument>) ||
  model<NotificationPreferenceDocument>('NotificationPreference', notificationPreferenceSchema);
