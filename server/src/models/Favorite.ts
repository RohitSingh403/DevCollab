import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

const favoriteSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    kind: { type: String, enum: ['project', 'issue'], required: true },
    target: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

favoriteSchema.index({ user: 1, kind: 1, target: 1 }, { unique: true });

export type FavoriteDocument = InferSchemaType<typeof favoriteSchema> & { _id: Schema.Types.ObjectId };

export const Favorite = (models.Favorite as Model<FavoriteDocument>) || model<FavoriteDocument>('Favorite', favoriteSchema);
