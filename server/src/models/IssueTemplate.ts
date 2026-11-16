import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';
import { ESTIMATES, PRIORITIES, STATUSES } from '../constants';

const templateStepSchema = new Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 140 },
  },
  { _id: false },
);

const issueTemplateSchema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    title: { type: String, default: '', trim: true, maxlength: 140 },
    description: { type: String, default: '', maxlength: 5000 },
    status: { type: String, enum: STATUSES, default: 'backlog' },
    priority: { type: String, enum: PRIORITIES, default: 'medium' },
    estimate: { type: Number, enum: [...ESTIMATES, null], default: null },
    labels: [{ type: Schema.Types.ObjectId, ref: 'Label' }],
    checklist: { type: [templateStepSchema], default: [] },
  },
  { timestamps: true },
);

issueTemplateSchema.index({ project: 1, name: 1 }, { unique: true });

export type IssueTemplateDocument = InferSchemaType<typeof issueTemplateSchema> & { _id: Schema.Types.ObjectId };

export const IssueTemplate =
  (models.IssueTemplate as Model<IssueTemplateDocument>) || model<IssueTemplateDocument>('IssueTemplate', issueTemplateSchema);
