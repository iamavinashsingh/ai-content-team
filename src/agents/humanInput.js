// src/agents/humanInput.js
// ============================================================
// Node 2: Human Input (Interrupt Node)
//
// This node PAUSES the graph and waits for the user to answer
// the PM's clarifying questions via the REST API.
//
// LangGraph interrupt() mechanism:
//  - When this node runs, it calls interrupt() which serializes
//    the graph state and suspends execution
//  - The API layer (/api/v1/project/:id/feedback) resumes
//    the graph by calling graph.invoke() with the human's answer
//    passed as the interrupt resume value
//
// State reads:  clarifyingQuestions
// State writes: clarifyingAnswers, graphStatus
// ============================================================

import { interrupt } from '@langchain/langgraph';

export async function humanInputNode(state) {
  console.log('[humanInput] Graph paused — waiting for user input');
  console.log(`[humanInput] ${state.clarifyingQuestions.length} question(s) pending`);

  // Format questions for the UI to display
  const questionsForUi = state.clarifyingQuestions.map((q, i) => ({
    index:    i + 1,
    id:       q.id,
    question: q.question,
    reason:   q.reason,
  }));

  // interrupt() suspends the graph here.
  // The value passed to interrupt() is surfaced to the API caller
  // so the frontend knows exactly what to show the user.
  // When the user submits answers, the API resumes with their input.
  const humanResponse = interrupt({
    type:      'clarifying_questions',
    questions: questionsForUi,
    message:   'Please answer the following questions so we can write the best possible article for you.',
  });

  // humanResponse contains what the user submitted when resuming
  // Format: { answers: "User's combined answer text" }
  const answersText = typeof humanResponse === 'string'
    ? humanResponse
    : humanResponse?.answers || JSON.stringify(humanResponse);

  console.log('[humanInput] User provided answers — resuming graph');

  return {
    clarifyingAnswers: answersText,
    graphStatus:       'running',
  };
}
