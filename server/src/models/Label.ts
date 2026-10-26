import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

const labelSchema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 32 },
    color: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

labelSchema.index({ workspace: 1, name: 1 }, { unique: true });

export type LabelDocument = InferSchemaType<typeof labelSchema> & { _id: Schema.Types.ObjectId };

export const Label = (models.Label as Model<LabelDocument>) || model<LabelDocument>('Label', labelSchema);
