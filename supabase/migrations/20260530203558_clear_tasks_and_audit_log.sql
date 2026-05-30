/*
  # Clear task-related tables and audit_log

  Deletes all rows from task_steps, task_questions, task_question_answers,
  task_assignees, task_images, tasks, and audit_log.
  Order respects foreign key constraints.
*/

DELETE FROM task_images;
DELETE FROM task_assignees;
DELETE FROM task_question_answers;
DELETE FROM task_questions;
DELETE FROM task_steps;
DELETE FROM tasks;
DELETE FROM audit_log;
