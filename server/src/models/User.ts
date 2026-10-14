import type { PublicUser } from '@f1/shared';
import { model, Schema, type Types } from 'mongoose';

export interface UserDoc {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  displayName: string;
  favouriteDriverId: string | null;
  favouriteTeamId: string | null;
}

const UserSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, required: true, trim: true, maxlength: 40 },
    favouriteDriverId: { type: String, default: null },
    favouriteTeamId: { type: String, default: null },
  },
  { timestamps: true },
);

export const UserModel = model<UserDoc>('User', UserSchema);

export const toPublicUser = (u: UserDoc): PublicUser => ({
  id: u._id.toString(),
  email: u.email,
  displayName: u.displayName,
  favouriteDriverId: u.favouriteDriverId ?? null,
  favouriteTeamId: u.favouriteTeamId ?? null,
});
