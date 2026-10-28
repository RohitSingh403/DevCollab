import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';
import { PRIORITIES, STATUSES } from '../constants';

const filtersSchema = new Schema(
  {
    status: { type: String, enum: ['', ...STATUSES], default: '' },
    priority: { type: String, enum: ['', ...PRIORITIES], default: '' },
    assignee: { type: String, default: '' },
    overdue: { type: Boolean, default: false },
    q: { type: String, default: '', maxlength: 80 },
    layout: { type: String, enum: ['board', 'list'], default: 'board' },
  },
  { _id: false },
);

const savedViewSchema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    shared: { type: Boolean, default: false },
    filters: { type: filtersSchema, required: true },
  },
  { timestamps: true },
);

savedViewSchema.index({ project: 1, createdBy: 1, name: 1 }, { unique: true });

export type SavedViewDocument = InferSchemaType<typeof savedViewSchema> & { _id: Schema.Types.ObjectId };

export const SavedView =
  (models.SavedView as Model<SavedViewDocument>) || model<SavedViewDocument>('SavedView', savedViewSchema);
