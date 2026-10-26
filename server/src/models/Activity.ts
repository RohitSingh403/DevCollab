import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

const activitySchema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    issue: { type: Schema.Types.ObjectId, ref: 'Issue', default: null },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    message: { type: String, required: true, maxlength: 400 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

activitySchema.index({ workspace: 1, createdAt: -1 });
activitySchema.index({ issue: 1, createdAt: -1 });
activitySchema.index({ project: 1, createdAt: -1 });

export type ActivityDocument = InferSchemaType<typeof activitySchema> & { _id: Schema.Types.ObjectId };

export const Activity =
  (models.Activity as Model<ActivityDocument>) || model<ActivityDocument>('Activity', activitySchema);
