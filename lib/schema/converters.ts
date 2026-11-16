import {
  collection,
  doc,
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
  type Firestore,
} from "@/lib/db/firestore";
import type { ZodType } from "zod";
import {
  StudentSchema,
  PositionSchema,
  NomineeSchema,
  VoteSchema,
  PostSchema,
  QuestionSchema,
  CommentSchema,
  ReactionSchema,
  DebateSchema,
  PredictionSchema,
  BannerSchema,
  ElectionSettingsSchema,
  PulsePollSchema,
  type Student,
  type Position,
  type Nominee,
  type Vote,
  type Post,
  type Question,
  type Comment,
  type Reaction,
  type Debate,
  type Prediction,
  type Banner,
  type ElectionSettings,
  type PulsePoll,
} from "./entities";

export type WithId<T> = T & { _id: string };

/**
 * Validates on read. On schema drift we log and still return the data,
 * so a single malformed doc never breaks a screen during the election (SCHEMA §6.4).
 */
function converter<T>(schema: ZodType<T>, name: string): FirestoreDataConverter<WithId<T>> {
  return {
    toFirestore: (data) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _id, ...rest } = data as WithId<T>;
      return rest as DocumentData;
    },
    fromFirestore: (snap: QueryDocumentSnapshot, options?: SnapshotOptions) => {
      const raw = snap.data({ ...options, serverTimestamps: "estimate" });
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        console.warn(`[schema] ${name}/${snap.id} failed validation`, parsed.error.flatten());
        return { ...(raw as T), _id: snap.id };
      }
      return { ...parsed.data, _id: snap.id };
    },
  };
}

const loose = <T>(s: unknown) => s as ZodType<T>;

export const conv = {
  student: converter<Student>(loose(StudentSchema), "students"),
  position: converter<Position>(loose(PositionSchema), "positions"),
  nominee: converter<Nominee>(loose(NomineeSchema), "nominees"),
  vote: converter<Vote>(loose(VoteSchema), "votes"),
  post: converter<Post>(loose(PostSchema), "posts"),
  question: converter<Question>(loose(QuestionSchema), "questions"),
  comment: converter<Comment>(loose(CommentSchema), "comments"),
  reaction: converter<Reaction>(loose(ReactionSchema), "reactions"),
  debate: converter<Debate>(loose(DebateSchema), "debates"),
  prediction: converter<Prediction>(loose(PredictionSchema), "predictions"),
  banner: converter<Banner>(loose(BannerSchema), "banners"),
  pulsePoll: converter<PulsePoll>(loose(PulsePollSchema), "pulsePolls"),
  settings: converter<ElectionSettings>(loose(ElectionSettingsSchema), "settings"),
};

/** Typed refs — import these instead of writing collection paths by hand. */
export const refs = (db: Firestore) => ({
  student: (niatId: string) => doc(db, "students", niatId).withConverter(conv.student),
  positions: () => collection(db, "positions").withConverter(conv.position),
  nominees: () => collection(db, "nominees").withConverter(conv.nominee),
  nominee: (id: string) => doc(db, "nominees", id).withConverter(conv.nominee),
  vote: (id: string) => doc(db, "votes", id).withConverter(conv.vote),
  votes: () => collection(db, "votes").withConverter(conv.vote),
  posts: () => collection(db, "posts").withConverter(conv.post),
  questions: () => collection(db, "questions").withConverter(conv.question),
  comments: () => collection(db, "comments").withConverter(conv.comment),
  reaction: (id: string) => doc(db, "reactions", id).withConverter(conv.reaction),
  debate: (positionId: string) => doc(db, "debates", positionId).withConverter(conv.debate),
  prediction: (niatId: string) => doc(db, "predictions", niatId).withConverter(conv.prediction),
  banners: () => collection(db, "banners").withConverter(conv.banner),
  pulsePolls: () => collection(db, "pulsePolls").withConverter(conv.pulsePoll),
  settings: () => doc(db, "settings", "election").withConverter(conv.settings),
});
