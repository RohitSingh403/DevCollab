import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

const recentIssueSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    issue: { type: Schema.Types.ObjectId, ref: 'Issue', required: true },
    viewedAt: { type: Date, required: true },
  },
  { timestamps: false },
);

recentIssueSchema.index({ user: 1, workspace: 1, issue: 1 }, { unique: true });
recentIssueSchema.index({ user: 1, workspace: 1, viewedAt: -1 });

export type RecentIssueDocument = InferSchemaType<typeof recentIssueSchema> & { _id: Schema.Types.ObjectId };

export const RecentIssue =
  (models.RecentIssue as Model<RecentIssueDocument>) || model<RecentIssueDocument>('RecentIssue', recentIssueSchema);
