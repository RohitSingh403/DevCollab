import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    type: { type: String, required: true },
    message: { type: String, required: true, maxlength: 400 },
    link: { type: String, default: '' },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ user: 1, createdAt: -1 });

export type NotificationDocument = InferSchemaType<typeof notificationSchema> & { _id: Schema.Types.ObjectId };

export const Notification =
  (models.Notification as Model<NotificationDocument>) ||
  model<NotificationDocument>('Notification', notificationSchema);
