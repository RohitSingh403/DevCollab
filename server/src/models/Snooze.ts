import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

const snoozeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    issue: { type: Schema.Types.ObjectId, ref: 'Issue', required: true, index: true },
    until: { type: Date, required: true },
  },
  { timestamps: true },
);

snoozeSchema.index({ user: 1, issue: 1 }, { unique: true });

export type SnoozeDocument = InferSchemaType<typeof snoozeSchema> & { _id: Schema.Types.ObjectId };

export const Snooze = (models.Snooze as Model<SnoozeDocument>) || model<SnoozeDocument>('Snooze', snoozeSchema);
