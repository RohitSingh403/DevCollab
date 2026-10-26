import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

const commentSchema = new Schema(
  {
    issue: { type: Schema.Types.ObjectId, ref: 'Issue', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type CommentDocument = InferSchemaType<typeof commentSchema> & { _id: Schema.Types.ObjectId };

export const Comment = (models.Comment as Model<CommentDocument>) || model<CommentDocument>('Comment', commentSchema);
