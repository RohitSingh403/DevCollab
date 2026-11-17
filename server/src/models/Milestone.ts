import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

const milestoneSchema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    targetDate: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

milestoneSchema.index({ project: 1, name: 1 });

export type MilestoneDocument = InferSchemaType<typeof milestoneSchema> & { _id: Schema.Types.ObjectId };

export const Milestone =
  (models.Milestone as Model<MilestoneDocument>) || model<MilestoneDocument>('Milestone', milestoneSchema);
