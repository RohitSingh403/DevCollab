import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';
import { PRIORITIES, PRIORITY_RANK, STATUSES, type Priority } from '../constants';

const issueSchema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    number: { type: Number, required: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, default: '', maxlength: 5000 },
    status: { type: String, enum: STATUSES, default: 'backlog', index: true },
    priority: { type: String, enum: PRIORITIES, default: 'medium' },
    priorityRank: { type: Number, default: PRIORITY_RANK.medium },
    labels: [{ type: Schema.Types.ObjectId, ref: 'Label' }],
    assignees: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dueDate: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    commentCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

issueSchema.index({ project: 1, number: 1 }, { unique: true });
issueSchema.index({ project: 1, status: 1, updatedAt: -1 });
issueSchema.index({ workspace: 1, dueDate: 1 });
issueSchema.index({ assignees: 1 });

issueSchema.pre('save', function setRank() {
  this.priorityRank = PRIORITY_RANK[this.priority as Priority] ?? PRIORITY_RANK.medium;
});

export type IssueDocument = InferSchemaType<typeof issueSchema> & { _id: Schema.Types.ObjectId };

export const Issue = (models.Issue as Model<IssueDocument>) || model<IssueDocument>('Issue', issueSchema);
