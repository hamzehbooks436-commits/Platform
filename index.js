import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { onValueCreated } from "firebase-functions/v2/database";

initializeApp();

// This runs on Firebase's server. Correct answers are never sent to students
// until their homework submission has been received and graded.
export const gradeHomework = onValueCreated("/homeworkSubmissions/{homeworkId}/{uid}", async event => {
  const submission = event.data.val();
  const database = getDatabase();
  const [homeworkSnapshot, answerKeySnapshot] = await Promise.all([
    database.ref(`homeworks/${event.params.homeworkId}`).get(),
    database.ref(`homeworkAnswerKeys/${event.params.homeworkId}`).get()
  ]);
  const homework = homeworkSnapshot.val();
  const answerKey = answerKeySnapshot.val();
  if (!homework || !answerKey?.answers?.length) return;

  const answers = Object.values(submission.answers || {});
  const correctAnswers = Object.values(answerKey.answers);
  const correct = correctAnswers.filter((answer, index) => answers[index] === answer).length;
  const grade = Math.round((correct / correctAnswers.length) * 100);
  await event.data.ref.update({ grade, correctAnswers, gradedAt: Date.now() });
});
