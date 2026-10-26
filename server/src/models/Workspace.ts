import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

const workspaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '', maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export type WorkspaceDocument = InferSchemaType<typeof workspaceSchema> & { _id: Schema.Types.ObjectId };

export const Workspace =
  (models.Workspace as Model<WorkspaceDocument>) || model<WorkspaceDocument>('Workspace', workspaceSchema);
