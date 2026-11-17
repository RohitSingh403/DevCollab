import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';
import { REACTIONS } from '../constants';

const reactionSchema = new Schema(
  {
    emoji: { type: String, enum: REACTIONS, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false },
);

const commentSchema = new Schema(
  {
    issue: { type: Schema.Types.ObjectId, ref: 'Issue', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    editedAt: { type: Date, default: null },
    pinnedAt: { type: Date, default: null },
    reactions: { type: [reactionSchema], default: [] },
  },
  { timestamps: true },
);

export type CommentDocument = InferSchemaType<typeof commentSchema> & { _id: Schema.Types.ObjectId };

export const Comment = (models.Comment as Model<CommentDocument>) || model<CommentDocument>('Comment', commentSchema);
