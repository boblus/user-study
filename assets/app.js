/**
 * Main application logic
 * Single-page application (SPA) using hash routing
 */

// Application state
const AppState = {
    currentToken: null,
    assignment: null,
    currentState: null,
    currentTaskIndex: null,
    autosaveInterval: null,
    timerInterval: null
};

// Route configuration
const routes = {
    '/login': 'view-login',
    '/overview': 'view-overview',
    '/instructions': 'view-instructions',
    '/task': 'view-task',
    '/questionnaire': 'view-questionnaire',
    '/complete': 'view-complete'
};

/**
 * Initialize application
 */
async function initApp() {
    // Check if there's a saved session
    const savedToken = localStorage.getItem('currentParticipantToken');
    if (savedToken) {
        try {
            await loadParticipantSession(savedToken);
            // Determine which page to navigate to based on state
            const state = AppState.currentState;
            if (!state.currentTaskIndex) {
                navigateTo('/overview');
            } else {
                const taskStatus = backend.getTaskStatus(state, state.currentTaskIndex);
                if (taskStatus === 'QUESTIONNAIRE_DONE') {
                    // Check if all tasks are completed
                    const allDone = [1, 2, 3].every(idx => 
                        backend.getTaskStatus(state, idx) === 'QUESTIONNAIRE_DONE'
                    );
                    if (allDone) {
                        navigateTo('/complete');
                    } else {
                        navigateTo('/overview');
                    }
                } else if (taskStatus === 'SUBMITTED') {
                    navigateTo('/questionnaire');
                } else if (taskStatus === 'IN_PROGRESS') {
                    navigateTo('/task');
                } else {
                    navigateTo('/instructions');
                }
            }
        } catch (error) {
            console.error('Failed to restore session:', error);
            navigateTo('/login');
        }
    } else {
        navigateTo('/login');
    }

    // Listen for hash changes
    window.addEventListener('hashchange', handleRoute);
    
    // Bind event listeners
    bindEventListeners();
}

/**
 * Handle route changes
 */
function handleRoute() {
    const hash = window.location.hash.slice(1) || '/login';
    const route = hash.split('?')[0];
    const viewId = routes[route] || routes['/login'];
    
    // Hide all views
    document.querySelectorAll('.view').forEach(view => {
        view.style.display = 'none';
    });
    
    // Show current view
    const currentView = document.getElementById(viewId);
    if (currentView) {
        currentView.style.display = 'block';
    }
    
    // Execute corresponding logic based on route
    switch (route) {
        case '/login':
            renderLogin();
            break;
        case '/overview':
            renderOverview();
            break;
        case '/instructions':
            renderInstructions();
            break;
        case '/task':
            renderTask();
            break;
        case '/questionnaire':
            renderQuestionnaire();
            break;
        case '/complete':
            renderComplete();
            break;
    }
}

/**
 * Navigate to specified route
 */
function navigateTo(route) {
    window.location.hash = route;
}

/**
 * Bind event listeners
 */
function bindEventListeners() {
    // Login
    document.getElementById('login-btn').addEventListener('click', handleLogin);
    document.getElementById('participant-token').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    // Overview page
    document.getElementById('continue-btn').addEventListener('click', handleContinue);
    document.getElementById('back-to-login-overview').addEventListener('click', handleBackToLogin);

    // Instructions page
    document.getElementById('start-task-btn').addEventListener('click', handleStartTask);
    document.getElementById('back-to-login-instructions').addEventListener('click', handleBackToLogin);

    // Task page
    document.getElementById('start-writing-btn').addEventListener('click', handleStartWriting);
    document.getElementById('start-writing-collab-btn').addEventListener('click', handleStartWriting);
    document.getElementById('start-writing-e2e-btn').addEventListener('click', handleStartWritingE2E);
    document.getElementById('generate-btn').addEventListener('click', handleGenerate);
    
    // Allow Enter key in judgment input to trigger generate
    const judgmentInput = document.getElementById('judgment-input');
    if (judgmentInput) {
        judgmentInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleGenerate();
            }
        });
    }
    
    // Multiple candidates - Select buttons (Stage 1)
    document.querySelectorAll('.select-candidate-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.getAttribute('data-index'), 10);
            handleSelectCandidate(index);
        });
    });
    
    // Regenerate button (Stage 1)
    const regenerateBtn = document.getElementById('regenerate-btn');
    if (regenerateBtn) regenerateBtn.addEventListener('click', handleRegenerate);
    
    // Accept/Reject selected candidate (Stage 2)
    const acceptSelectedBtn = document.getElementById('accept-selected-btn');
    if (acceptSelectedBtn) acceptSelectedBtn.addEventListener('click', handleAcceptSelected);
    
    const rejectSelectedBtn = document.getElementById('reject-selected-btn');
    if (rejectSelectedBtn) rejectSelectedBtn.addEventListener('click', handleRejectSelected);
    
    document.getElementById('submit-review-btn').addEventListener('click', handleSubmitReview);
    document.getElementById('pause-writing-btn').addEventListener('click', handlePauseWriting);
    document.getElementById('resume-writing-btn').addEventListener('click', handleResumeWriting);
    document.getElementById('review-editor').addEventListener('input', handleEditorInput);
    document.getElementById('back-to-login-task').addEventListener('click', handleBackToLogin);
    
    // Instructions toggle
    const instructionsToggle = document.getElementById('instructions-toggle');
    if (instructionsToggle) {
        instructionsToggle.addEventListener('click', () => {
            const container = instructionsToggle.parentElement;
            container.classList.toggle('collapsed');
        });
    }

    // Questionnaire page
    document.getElementById('questionnaire-form').addEventListener('submit', handleQuestionnaireSubmit);
    document.getElementById('back-to-login-questionnaire').addEventListener('click', handleBackToLogin);

    // Complete page
    document.getElementById('back-to-login-complete').addEventListener('click', handleBackToLogin);
}

/**
 * Handle back to login - clear all session data
 */
function handleBackToLogin() {
    // Remove saved token from localStorage
    localStorage.removeItem('currentParticipantToken');
    
    // Reset all application state
    resetAppState();
    
    // Navigate to login page
    navigateTo('/login');
}

/**
 * Reset application state completely
 */
function resetAppState() {
    // Clear autosave interval
    if (AppState.autosaveInterval) {
        clearInterval(AppState.autosaveInterval);
        AppState.autosaveInterval = null;
    }
    
    // Clear timer interval
    if (AppState.timerInterval) {
        clearInterval(AppState.timerInterval);
        AppState.timerInterval = null;
    }
    
    // Reset all state
    AppState.currentToken = null;
    AppState.assignment = null;
    AppState.currentState = null;
    AppState.currentTaskIndex = null;
    
    // Clear DOM elements that might contain old data
    const editor = document.getElementById('review-editor');
    if (editor) editor.value = '';
    
    const judgmentInput = document.getElementById('judgment-input');
    if (judgmentInput) judgmentInput.value = '';
    
    const judgmentLabel = document.getElementById('judgment-label');
    if (judgmentLabel) judgmentLabel.textContent = 'Judgment 1:';
    
    const generatedText = document.getElementById('collab-generated-text');
    if (generatedText) generatedText.value = '';
    
    const historyContainer = document.getElementById('judgment-history-container');
    if (historyContainer) historyContainer.innerHTML = '';
    
    const roundsContainer = document.getElementById('collab-rounds-container');
    if (roundsContainer) roundsContainer.innerHTML = '';
}

/**
 * Load participant session
 */
async function loadParticipantSession(token) {
    // First, reset all state to prevent data leakage between users
    resetAppState();
    
    const assignment = await backend.getAssignment(token);
    if (!assignment) {
        throw new Error('Invalid participant token');
    }

    const state = await backend.getCurrentState(token);
    
    AppState.currentToken = token;
    AppState.assignment = assignment;
    AppState.currentState = state;
    AppState.currentTaskIndex = state.currentTaskIndex || findNextTask(state);
    
    localStorage.setItem('currentParticipantToken', token);
}

/**
 * Find next task
 */
function findNextTask(state) {
    const assignment = AppState.assignment;
    if (!assignment || !assignment.tasks) return null;
    
    for (let i = 0; i < assignment.tasks.length; i++) {
        const taskIndex = assignment.tasks[i].index;
        const status = backend.getTaskStatus(state, taskIndex);
        if (status !== 'QUESTIONNAIRE_DONE') {
            return taskIndex;
        }
    }
    return null;
}

/**
 * Handle login
 */
async function handleLogin() {
    const token = document.getElementById('participant-token').value.trim();
    const errorDiv = document.getElementById('login-error');
    
    if (!token) {
        errorDiv.textContent = 'Please enter a participant ID';
        errorDiv.style.display = 'block';
        return;
    }

    try {
        await loadParticipantSession(token);
        errorDiv.style.display = 'none';
        navigateTo('/overview');
    } catch (error) {
        errorDiv.textContent = 'Invalid participant ID';
        errorDiv.style.display = 'block';
    }
}

/**
 * Render login page
 */
function renderLogin() {
    document.getElementById('participant-token').value = '';
    document.getElementById('login-error').style.display = 'none';
}

/**
 * Render overview page
 */
async function renderOverview() {
    const state = AppState.currentState;
    const assignment = AppState.assignment;
    const tasksList = document.getElementById('tasks-list');
    tasksList.innerHTML = '';

    // Find the current active task (first task that is not completed)
    const activeTaskIndex = findNextTask(state);
    AppState.currentTaskIndex = activeTaskIndex;

    // Iterate through actual tasks in assignment
    for (let i = 0; i < assignment.tasks.length; i++) {
        const task = assignment.tasks[i];
        const taskIndex = task.index;
        const status = backend.getTaskStatus(state, taskIndex);
        const isActive = taskIndex === activeTaskIndex;
        const isLocked = !isActive && status === 'NOT_STARTED';

        const taskItem = document.createElement('div');
        taskItem.className = `task-item ${isActive ? 'active' : ''} ${isLocked ? 'locked' : ''}`;
        
        const statusText = {
            'NOT_STARTED': 'Not started',
            'IN_PROGRESS': 'In progress',
            'SUBMITTED': 'Submitted',
            'QUESTIONNAIRE_DONE': 'Completed'
        };

        taskItem.innerHTML = `
            <h3>Task ${i + 1}</h3>
            <div class="task-meta">
                <span>${getParadigmName(task.paradigm)}</span>
                <span class="task-status ${status.toLowerCase().replace('_', '-')}">${statusText[status]}</span>
            </div>
        `;

        tasksList.appendChild(taskItem);
    }

    // Update continue button state and text
    const continueBtn = document.getElementById('continue-btn');
    if (activeTaskIndex) {
        continueBtn.disabled = false;
        const currentTaskStatus = backend.getTaskStatus(state, activeTaskIndex);
        if (currentTaskStatus === 'NOT_STARTED') {
            continueBtn.textContent = 'Start';
        } else {
            continueBtn.textContent = 'Continue';
        }
    } else {
        continueBtn.disabled = true;
    }
}

/**
 * Get paradigm name
 */
function getParadigmName(paradigm) {
    const names = {
        'scratch': 'From-scratch',
        'e2e': 'End-to-end',
        'collab': 'Collaborative'
    };
    return names[paradigm] || paradigm;
}

/**
 * Get instructions HTML based on paradigm
 * @param {string} paradigm - 'scratch', 'e2e', or 'collab'
 * @param {boolean} isFullPage - true for instructions page, false for task sidebar
 */
function getInstructionsHTML(paradigm, isFullPage) {
    const headingTag = isFullPage ? 'h3' : 'h4';
    
    if (paradigm === 'e2e') {
        return `
            <p>In this task, you will produce a review by <strong>post-editing an LLM-generated draft</strong>. Please read the instructions carefully.</p>
            <br>
            <${headingTag}>1. Read the paper first</${headingTag}>
            <p>Please read the assigned paper carefully before starting the timed writing phase.</p>
            <br>
            <${headingTag}>2. Sketch your intent before seeing the draft</${headingTag}>
            <p>Before we show you the LLM-generated draft, please write a brief list of the key points you intend to raise in your review. This sketch should include the main strengths and weaknesses you want to mention. <strong>This step is required</strong> and helps us capture your initial intent.</p>
            <br>
            <${headingTag}>3. Start the timed writing phase</${headingTag}>
            <p>Once you have finished reading and completed your key-point sketch, click <strong>Start writing</strong>. Timing begins at this moment. Please try to reserve at least <strong>120 minutes</strong> of uninterrupted time for writing, since we would like to record the completion time. If you need to step away, please click <strong>Pause</strong>.</p>
            <br>
            <${headingTag}>4. Edit the LLM-generated draft to match your intent</${headingTag}>
            <p>After you click Start writing, we will display an LLM-generated draft review. Your task is to revise this draft so that the final review reflects your intended points and judgments. You may freely delete incorrect or irrelevant content, add missing points, rewrite sentences, and reorganize the text.</p>
            <br>
            <${headingTag}>5. Output</${headingTag}>
            <p>Please output only the <strong>Strengths</strong>, <strong>Weaknesses</strong>, and <strong>Comments/Suggestions/Typos</strong> (if there are any) sections. You do <strong>not</strong> need to write a paper summary or provide review scores.</p>
            <br>
            <${headingTag}>6. Review guidelines</${headingTag}>
            <ul>
                <li><strong>Summary of Strengths:</strong> What are the major reasons to publish this paper at a selective *ACL venue? These could include novel and useful methodology, insightful empirical results or theoretical analysis, clear organization of related literature, or any other reason why interested readers of *ACL papers may find the paper useful.</li>
                <li><strong>Summary of Weaknesses:</strong> What are the concerns that you have about the paper that would cause you to favor prioritizing other high-quality papers that are also under consideration for publication? These could include concerns about correctness of the results or argumentation, limited perceived impact of the methods or findings (note that impact can be significant both in broad or in narrow sub-fields), lack of clarity in exposition, or any other reason why interested readers of *ACL papers may gain less from this paper than they would from other papers under consideration. Where possible, please number your concerns so authors may respond to them individually.</li>
                <li><strong>Comments/Suggestions/Typos:</strong> If you have any comments to the authors about how they may improve their paper, other than addressing the concerns above, please list them here.</li>
            </ul>
            <${headingTag}>7. Submit</${headingTag}>
            <p>When you are satisfied with the final review, click <strong>Submit</strong>.</p>
            <br>
            <${headingTag}>8. Post-task questionnaire</${headingTag}>
            <p>After submitting, please complete a short questionnaire.</p>
        `;
    }
    
    if (paradigm === 'collab') {
        return `
            <p>In this task, you will produce a review by <strong>collaborating with an LLM</strong>. Please read the instructions carefully.</p>
            <br>
            <${headingTag}>1. Read the paper first</${headingTag}>
            <p>Please read the assigned paper carefully before starting the timed writing phase.</p>
            <br>
            <${headingTag}>2. Start the timed writing phase</${headingTag}>
            <p>Once you have finished reading, click <strong>Start writing</strong>. Timing begins at this moment. Please try to reserve at least <strong>120 minutes</strong> of uninterrupted time for writing, since we would like to record the completion time. If you need to step away, please click <strong>Pause</strong>.</p>
            <br>
            <${headingTag}>3. Collaborate with the LLM</${headingTag}>
            <p>You will write the review by iterating over <strong>judgement</strong> → <strong>generation</strong> → <strong>selection</strong> → <strong>feedback/edit</strong> cycles.</p>
            <br>
            <ul>
                <li><p><strong>Step A: Enter a judgment (one at a time)</strong></p>
                <p>In the Judgement block, write one strength/weakness point you want to raise in the review.</p></li>
                <li><p><strong>Step B: Generate candidates</strong></p>
                <p>After you submit your judgment, the system will generate 2 candidate review comments.</p></li>
                <li><p><strong>Step C: Choose and refine</strong></p>
                <p>Select the candidate you prefer. You may then edit the selected review to better reflect your intent.</p></li>
                <li><p><strong>Step D: Accept or reject</strong></p>
                <ul>
                    <li><p>If the candidate is satisfactory, <strong>accept</strong> it and move on to the next judgment.</p></li>
                    <li><p>If it is not satisfactory, you may <strong>provide feedback</strong>. The system will then generate a new candidate based on your feedback.</p></li>
                    <li><p>If further interaction is not helpful for a particular point, you may <strong>stop iterating</strong> on that point and proceed to the next judgment.</p></li>
                </ul></li>
            </ul>
            <p>You may repeat steps A-D <strong>multiple rounds</strong> until you have covered the strengths, weakness, and suggestions you want to include.</p>
            <br>
            <${headingTag}>4. Output</${headingTag}>
            <p>Please output only the <strong>Strengths</strong>, <strong>Weaknesses</strong>, and <strong>Comments/Suggestions/Typos</strong> (if there are any) sections. You do <strong>not</strong> need to write a paper summary or provide review scores.</p>
            <br>
            <${headingTag}>5. Review guidelines</${headingTag}>
            <ul>
                <li><strong>Summary of Strengths:</strong> What are the major reasons to publish this paper at a selective *ACL venue? These could include novel and useful methodology, insightful empirical results or theoretical analysis, clear organization of related literature, or any other reason why interested readers of *ACL papers may find the paper useful.</li>
                <li><strong>Summary of Weaknesses:</strong> What are the concerns that you have about the paper that would cause you to favor prioritizing other high-quality papers that are also under consideration for publication? These could include concerns about correctness of the results or argumentation, limited perceived impact of the methods or findings (note that impact can be significant both in broad or in narrow sub-fields), lack of clarity in exposition, or any other reason why interested readers of *ACL papers may gain less from this paper than they would from other papers under consideration. Where possible, please number your concerns so authors may respond to them individually.</li>
                <li><strong>Comments/Suggestions/Typos:</strong> If you have any comments to the authors about how they may improve their paper, other than addressing the concerns above, please list them here.</li>
            </ul>
            <${headingTag}>6. Submit</${headingTag}>
            <p>When you are satisfied with the final review, click <strong>Submit</strong>.</p>
            <br>
            <${headingTag}>7. Post-task questionnaire</${headingTag}>
            <p>After submitting, please complete a short questionnaire.</p>
        `;
    }
    
    // Default instructions for scratch
    return `
        <p><strong>Paradigm:</strong> ${getParadigmName(paradigm)}</p>
        
        <${headingTag}>Review criteria</${headingTag}>
        <p>Please review the paper according to the following criteria:</p>
        <ul>
            <li><strong>Contribution:</strong> What is the main contribution of the paper? Is it novel and meaningful?</li>
            <li><strong>Method:</strong> Is the method reasonable? Is the technical approach clear?</li>
            <li><strong>Experiments:</strong> Is the experimental design sufficient? Do the results support the conclusions?</li>
            <li><strong>Writing:</strong> Is the writing clear? Is the structure reasonable?</li>
        </ul>
        
        <${headingTag}>Task requirements</${headingTag}>
        <p>Please read the paper carefully and write a review according to the above criteria.</p>
    `;
}

/**
 * Handle continue button
 */
function handleContinue() {
    if (AppState.currentTaskIndex) {
        navigateTo('/instructions');
    }
}

/**
 * Render instructions page
 */
async function renderInstructions() {
    if (!AppState.currentTaskIndex) {
        navigateTo('/overview');
        return;
    }

    const task = AppState.assignment.tasks[AppState.currentTaskIndex - 1];
    const state = AppState.currentState;
    const taskState = state.tasks[AppState.currentTaskIndex] || {};

    // If review has been submitted, go directly to questionnaire
    if (taskState.submitted) {
        navigateTo('/questionnaire');
        return;
    }

    // Display instructions content based on paradigm
    const instructionsContent = document.getElementById('instructions-content');
    instructionsContent.innerHTML = getInstructionsHTML(task.paradigm, true);

    // If task has already started, navigate directly to task page
    if (taskState.started) {
        navigateTo('/task');
    }
}

/**
 * Handle start task
 */
async function handleStartTask() {
    const taskIndex = AppState.currentTaskIndex;
    const task = AppState.assignment.tasks[taskIndex - 1];
    const timestamp = new Date().toISOString();

    // Save task start state
    await backend.saveState(AppState.currentToken, taskIndex, {
        started: true,
        taskStartTimestamp: timestamp
    });

    // Log event
    await backend.appendEvent({
        participant_token: AppState.currentToken,
        participant_id: AppState.assignment.participantId,
        task_index: taskIndex,
        paper_id: task.paperId,
        paradigm: task.paradigm,
        event_type: 'start_task',
        timestamp
    });

    // Update state
    AppState.currentState = await backend.getCurrentState(AppState.currentToken);
    
    navigateTo('/task');
}

/**
 * Render task page
 */
async function renderTask() {
    if (!AppState.currentTaskIndex) {
        navigateTo('/overview');
        return;
    }

    const task = AppState.assignment.tasks[AppState.currentTaskIndex - 1];
    const state = AppState.currentState;
    const taskState = state.tasks[AppState.currentTaskIndex] || {};

    // If review has been submitted, go directly to questionnaire
    if (taskState.submitted) {
        navigateTo('/questionnaire');
        return;
    }

    // If task has started, reset taskStartTimestamp when re-entering
    if (taskState.started) {
        const timestamp = new Date().toISOString();
        await backend.saveState(AppState.currentToken, AppState.currentTaskIndex, {
            taskStartTimestamp: timestamp
        });
        // Update state
        AppState.currentState = await backend.getCurrentState(AppState.currentToken);
    }

    // Set PDF
    document.getElementById('pdf-iframe').src = `pdfs/${task.paperId}.pdf`;
    document.getElementById('task-title').textContent = `Task ${AppState.currentTaskIndex}: ${getParadigmName(task.paradigm)}`;

    // Display instructions based on paradigm
    const instructionsDiv = document.getElementById('task-instructions');
    instructionsDiv.innerHTML = getInstructionsHTML(task.paradigm, false);

    // Display different UI based on paradigm
    const scratchControls = document.getElementById('scratch-controls');
    const collabControls = document.getElementById('collab-controls');
    const startWritingBtn = document.getElementById('start-writing-btn');
    const startWritingCollabBtn = document.getElementById('start-writing-collab-btn');
    const generateBtn = document.getElementById('generate-btn');
    const collabInputArea = document.getElementById('collab-input-area');
    const editor = document.getElementById('review-editor');
    const editorContainer = document.getElementById('editor-container');
    const submitBtn = document.getElementById('submit-review-btn');
    const pauseBtn = document.getElementById('pause-writing-btn');
    const resumeBtn = document.getElementById('resume-writing-btn');

    let writingStarted = false;

    // Reset UI
    scratchControls.style.display = 'none';
    collabControls.style.display = 'none';
    const e2eControls = document.getElementById('e2e-controls');
    if (e2eControls) e2eControls.style.display = 'none';
    startWritingBtn.style.display = 'none';
    startWritingCollabBtn.style.display = 'none';
    if (collabInputArea) collabInputArea.style.display = 'none';
    editor.value = '';
    editorContainer.style.display = 'flex';
    submitBtn.style.display = 'inline-block';
    pauseBtn.style.display = 'none';
    resumeBtn.style.display = 'none';
    
    // Reset E2E sketch textarea
    const sketchTextarea = document.getElementById('key-point-sketch');
    if (sketchTextarea) {
        sketchTextarea.value = '';
        sketchTextarea.readOnly = false;
    }
    
    // Clear judgment history container to prevent stale data from showing
    const historyContainer = document.getElementById('judgment-history-container');
    if (historyContainer) historyContainer.innerHTML = '';
    
    // Clear collab rounds container
    const roundsContainer = document.getElementById('collab-rounds-container');
    if (roundsContainer) roundsContainer.innerHTML = '';

    if (task.paradigm === 'scratch') {
        // Scratch mode: show start writing button
        scratchControls.style.display = 'block';
        // If writing hasn't started yet, hide editor and submit button
        if (!taskState.writingStartTimestamp) {
            startWritingBtn.style.display = 'inline-block';
            editorContainer.style.display = 'none';
            submitBtn.style.display = 'none';
        } else {
            writingStarted = true;
        }
        // Restore draft
        if (taskState.draftText) {
            editor.value = taskState.draftText;
        }
    } else if (task.paradigm === 'e2e') {
        // E2E mode: show key-point sketch input first, then AI-generated draft
        const e2eControls = document.getElementById('e2e-controls');
        const sketchTextarea = document.getElementById('key-point-sketch');
        const startWritingE2EBtn = document.getElementById('start-writing-e2e-btn');
        
        if (e2eControls) e2eControls.style.display = 'block';
        
        if (!taskState.writingStartTimestamp) {
            // Writing hasn't started yet - show sketch input
            editorContainer.style.display = 'none';
            submitBtn.style.display = 'none';
            
            // Restore sketch if previously saved (but not yet submitted)
            if (taskState.keyPointSketch && sketchTextarea) {
                sketchTextarea.value = taskState.keyPointSketch;
            }
            
            // Make sketch editable
            if (sketchTextarea) {
                sketchTextarea.readOnly = false;
            }
            if (startWritingE2EBtn) {
                startWritingE2EBtn.style.display = 'inline-block';
            }
        } else {
            // Writing has started - show draft and make sketch read-only
            writingStarted = true;
            
            // Restore sketch (read-only)
            if (taskState.keyPointSketch && sketchTextarea) {
                sketchTextarea.value = taskState.keyPointSketch;
                sketchTextarea.readOnly = true;
            }
            
            // Hide start writing button
            if (startWritingE2EBtn) {
                startWritingE2EBtn.style.display = 'none';
            }
            
            // Load draft
            if (taskState.draftText) {
                editor.value = taskState.draftText;
            } else {
                // If no saved draft, load AI-generated draft
                try {
                    const e2eReviews = await backend.loadE2EReviews();
                    const draftText = e2eReviews[task.paperId] || 'Draft not found for this paper';
                    editor.value = draftText;
                } catch (error) {
                    console.error('Failed to load E2E draft:', error);
                    editor.value = 'Failed to load draft. Please refresh the page and try again.';
                }
            }
        }
    } else if (task.paradigm === 'collab') {
        // Collab mode: show collaboration controls
        collabControls.style.display = 'block';
        const generatedArea = document.getElementById('collab-generated-area');
        const generatedText = document.getElementById('collab-generated-text');
        const rejectFeedbackArea = document.getElementById('reject-feedback-area');
        
        if (taskState.writingStartTimestamp) {
            startWritingCollabBtn.style.display = 'none';
            writingStarted = true;
            
            const rounds = taskState.collabRounds || [];
            const acceptedCount = rounds.filter(r => r.status === 'accepted').length;
            const pendingRound = rounds.find(r => r.status === 'pending');
            const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
            
            // Update judgment label
            const judgmentLabel = document.getElementById('judgment-label');
            if (judgmentLabel) {
                judgmentLabel.textContent = `Judgment ${acceptedCount + 1}:`;
            }
            
            if (pendingRound) {
                // There's a pending round - show candidates
                if (collabInputArea) collabInputArea.style.display = 'block';  // Keep judgment visible
                if (generatedArea) {
                    const selectionStage = document.getElementById('candidates-selection-stage');
                    const confirmStage = document.getElementById('candidate-confirm-stage');
                    const selectedTextarea = document.getElementById('selected-candidate-text');
                    
                    // Check if user has already selected a candidate (Stage 2)
                    if (pendingRound.selectedCandidateIndex !== null && pendingRound.selectedCandidateIndex !== undefined) {
                        // Show Stage 2 with selected candidate
                        if (selectionStage) selectionStage.style.display = 'none';
                        if (confirmStage) confirmStage.style.display = 'block';
                        if (selectedTextarea && pendingRound.candidates) {
                            selectedTextarea.value = pendingRound.candidates[pendingRound.selectedCandidateIndex]?.output || '';
                        }
                        // Ensure Accept/Reject buttons are enabled
                        const acceptBtn = document.getElementById('accept-selected-btn');
                        const rejectBtn = document.getElementById('reject-selected-btn');
                        if (acceptBtn) {
                            acceptBtn.disabled = false;
                            acceptBtn.style.opacity = '1';
                        }
                        if (rejectBtn) {
                            rejectBtn.disabled = false;
                            rejectBtn.style.opacity = '1';
                        }
                    } else {
                        // Show Stage 1 - candidate selection
                        if (selectionStage) selectionStage.style.display = 'block';
                        if (confirmStage) confirmStage.style.display = 'none';
                        
                        // Restore candidates if they exist
                        if (pendingRound.candidates && pendingRound.candidates.length > 0) {
                            pendingRound.candidates.forEach((candidate, index) => {
                                const candidateTextarea = document.querySelector(`#candidate-${index} .candidate-text`);
                                if (candidateTextarea) {
                                    candidateTextarea.value = candidate.output;
                                }
                            });
                        }
                    }
                    generatedArea.style.display = 'block';
                }
                if (generateBtn) generateBtn.style.display = 'none';
                if (rejectFeedbackArea) rejectFeedbackArea.style.display = 'none';
            } else if (lastRound && lastRound.status === 'rejected' && !lastRound.feedback) {
                // Last round was rejected, show feedback area
                if (collabInputArea) collabInputArea.style.display = 'none';
                if (generatedArea) generatedArea.style.display = 'none';
                if (rejectFeedbackArea) rejectFeedbackArea.style.display = 'block';
            } else {
                // Ready for new judgment input
                if (collabInputArea) collabInputArea.style.display = 'block';
                if (generatedArea) generatedArea.style.display = 'none';
                if (rejectFeedbackArea) rejectFeedbackArea.style.display = 'none';
            }
        } else {
            // Writing has NOT started yet - show only Start Writing button
            startWritingCollabBtn.style.display = 'inline-block';
            if (collabInputArea) collabInputArea.style.display = 'none';
            if (generatedArea) generatedArea.style.display = 'none';
            if (rejectFeedbackArea) rejectFeedbackArea.style.display = 'none';
            // Hide editor and submit button before writing starts
            editorContainer.style.display = 'none';
            submitBtn.style.display = 'none';
            // Reset judgment label to 1 for fresh start
            const judgmentLabel = document.getElementById('judgment-label');
            if (judgmentLabel) judgmentLabel.textContent = 'Judgment 1:';
            // Hide judgment history container before writing starts
            const historyContainerCollab = document.getElementById('judgment-history-container');
            if (historyContainerCollab) historyContainerCollab.style.display = 'none';
            // Hide rounds container before writing starts
            const roundsContainerCollab = document.getElementById('collab-rounds-container');
            if (roundsContainerCollab) roundsContainerCollab.style.display = 'none';
        }
        
        // Only restore state if writing has started
        if (taskState.writingStartTimestamp) {
            // Writing has started - restore editor content
            if (taskState.draftText) {
                editor.value = taskState.draftText;
            }
            // Restore judgment
            if (taskState.judgment) {
                const judgmentInput = document.getElementById('judgment-input');
                if (judgmentInput) judgmentInput.value = taskState.judgment;
            }
            // Show judgment history container
            const historyContainerVisible = document.getElementById('judgment-history-container');
            if (historyContainerVisible) historyContainerVisible.style.display = 'block';
            // Show rounds container
            const roundsContainerVisible = document.getElementById('collab-rounds-container');
            if (roundsContainerVisible) roundsContainerVisible.style.display = 'block';
            // Restore judgment history from saved rounds
            const collabRounds = taskState.collabRounds || [];
            if (collabRounds.length > 0) {
                restoreJudgmentHistory(collabRounds);
            }
        }
    }

    // Show pause/resume buttons if writing has started
    if (writingStarted) {
        const pauseTimestamps = taskState.pauseTimestamps || [];
        const resumeTimestamps = taskState.resumeTimestamps || [];
        const isPaused = pauseTimestamps.length > resumeTimestamps.length;

        if (isPaused) {
            pauseBtn.style.display = 'none';
            resumeBtn.style.display = 'inline-block';
        } else {
            pauseBtn.style.display = 'inline-block';
            resumeBtn.style.display = 'none';
        }
    }

    // Start autosave
    startAutosave();
}

/**
 * Handle start writing
 */
async function handleStartWriting() {
    const taskIndex = AppState.currentTaskIndex;
    const task = AppState.assignment.tasks[taskIndex - 1];
    const timestamp = new Date().toISOString();

    await backend.saveState(AppState.currentToken, taskIndex, {
        writingStartTimestamp: timestamp
    });

    await backend.appendEvent({
        participant_token: AppState.currentToken,
        participant_id: AppState.assignment.participantId,
        task_index: taskIndex,
        paper_id: task.paperId,
        paradigm: task.paradigm,
        event_type: 'start_writing',
        timestamp
    });

    // Hide the appropriate start writing button based on paradigm
    if (task.paradigm === 'scratch') {
        document.getElementById('start-writing-btn').style.display = 'none';
        // Show editor, submit, and pause button
        document.getElementById('editor-container').style.display = 'flex';
        document.getElementById('submit-review-btn').style.display = 'inline-block';
        document.getElementById('pause-writing-btn').style.display = 'inline-block';
        document.getElementById('resume-writing-btn').style.display = 'none';
    } else if (task.paradigm === 'collab') {
        document.getElementById('start-writing-collab-btn').style.display = 'none';
        document.getElementById('collab-input-area').style.display = 'block';
        // Initialize judgment label to 1
        const judgmentLabel = document.getElementById('judgment-label');
        if (judgmentLabel) judgmentLabel.textContent = 'Judgment 1:';
        // Show editor and submit button
        document.getElementById('editor-container').style.display = 'flex';
        document.getElementById('submit-review-btn').style.display = 'inline-block';
        document.getElementById('pause-writing-btn').style.display = 'inline-block';
        document.getElementById('resume-writing-btn').style.display = 'none';
        // Show judgment history container (for future rounds)
        const historyContainer = document.getElementById('judgment-history-container');
        if (historyContainer) historyContainer.style.display = 'block';
        // Show collab rounds container
        const roundsContainer = document.getElementById('collab-rounds-container');
        if (roundsContainer) roundsContainer.style.display = 'block';
    }

    AppState.currentState = await backend.getCurrentState(AppState.currentToken);
}

/**
 * Handle start writing for E2E mode (with key-point sketch validation)
 */
async function handleStartWritingE2E() {
    const taskIndex = AppState.currentTaskIndex;
    const task = AppState.assignment.tasks[taskIndex - 1];
    
    // Get the key-point sketch
    const sketchTextarea = document.getElementById('key-point-sketch');
    const keyPointSketch = sketchTextarea ? sketchTextarea.value.trim() : '';
    
    // Validate: sketch must not be empty
    if (!keyPointSketch) {
        alert('Please enter your key points before starting. This is required to capture your initial intent.');
        return;
    }
    
    // Confirm with user
    const confirmed = confirm(
        'Are you sure you want to start writing?\n\n' +
        'Once you start, your key-point sketch will be locked and cannot be edited. ' +
        'The timer will begin and you will see the LLM-generated draft.'
    );
    
    if (!confirmed) {
        return;
    }
    
    const timestamp = new Date().toISOString();
    
    try {
        // Save state with key-point sketch and writing start timestamp
        await backend.saveState(AppState.currentToken, taskIndex, {
            keyPointSketch: keyPointSketch,
            writingStartTimestamp: timestamp
        });
        
        // Log event
        await backend.appendEvent({
            participant_token: AppState.currentToken,
            participant_id: AppState.assignment.participantId,
            task_index: taskIndex,
            paper_id: task.paperId,
            paradigm: task.paradigm,
            event_type: 'start_writing',
            payload: { keyPointSketch: keyPointSketch },
            timestamp
        });
    } catch (error) {
        console.error('Failed to save state or log event:', error);
        alert('Failed to save your progress. Please check your connection and try again.');
        return;
    }
    
    // Make sketch read-only
    if (sketchTextarea) {
        sketchTextarea.readOnly = true;
    }
    
    // Hide start writing button
    const startWritingE2EBtn = document.getElementById('start-writing-e2e-btn');
    if (startWritingE2EBtn) {
        startWritingE2EBtn.style.display = 'none';
    }
    
    // Show editor with AI-generated draft
    const editor = document.getElementById('review-editor');
    try {
        const e2eReviews = await backend.loadE2EReviews();
        const draftText = e2eReviews[task.paperId] || 'Draft not found for this paper';
        editor.value = draftText;
    } catch (error) {
        console.error('Failed to load E2E draft:', error);
        editor.value = 'Failed to load draft. Please refresh the page and try again.';
    }
    
    // Show editor, submit, and pause button
    document.getElementById('editor-container').style.display = 'flex';
    document.getElementById('submit-review-btn').style.display = 'inline-block';
    document.getElementById('pause-writing-btn').style.display = 'inline-block';
    document.getElementById('resume-writing-btn').style.display = 'none';
    
    try {
        AppState.currentState = await backend.getCurrentState(AppState.currentToken);
    } catch (error) {
        console.error('Failed to refresh state:', error);
    }
}

/**
 * Handle generate (collaborative mode) - generates multiple candidates
 */
async function handleGenerate() {
    const taskIndex = AppState.currentTaskIndex;
    const task = AppState.assignment.tasks[taskIndex - 1];
    
    // Get fresh state to ensure we have the latest rounds
    const state = await backend.getCurrentState(AppState.currentToken);
    AppState.currentState = state;
    const taskState = state.tasks[taskIndex] || {};
    const rounds = taskState.collabRounds || [];

    // Get judgment from input field
    const judgmentInput = document.getElementById('judgment-input');
    const judgment = judgmentInput ? judgmentInput.value.trim() : '';

    if (!judgment) {
        alert('Please enter judgment before generating.');
        return;
    }

    // Count accepted rounds to determine current judgment number
    const acceptedCount = rounds.filter(r => r.status === 'accepted').length;
    const currentJudgmentNum = acceptedCount + 1;

    // Get feedback from previous round (if any)
    const lastRound = rounds[rounds.length - 1];
    const feedback = lastRound && lastRound.status === 'rejected' && lastRound.feedback ? lastRound.feedback : '';

    // Disable generate button during generation
    const generateBtn = document.getElementById('generate-btn');
    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';
    }

    try {
        // Generate multiple candidates in parallel
        const candidates = await CollabSimulator.generateMultipleCandidates(
            task.paperId,
            rounds,
            judgment,
            feedback
        );

        // Add new round with multiple candidates
        const newRound = {
            roundId: rounds.length + 1,
            judgmentNum: currentJudgmentNum,
            judgment: judgment,
            candidates: candidates,  // Array of {output, temperature}
            output: null,  // Will be set when user accepts a candidate
            selectedCandidateIndex: null,
            status: 'pending',
            timestamp: new Date().toISOString()
        };

        const updatedRounds = [...rounds, newRound];
        await backend.saveState(AppState.currentToken, taskIndex, {
            collabRounds: updatedRounds,
            judgment: judgment
        });
        
        // Hide generate button but keep judgment input visible for reference
        if (generateBtn) generateBtn.style.display = 'none';

        // Show candidates in the UI (Stage 1)
        const generatedArea = document.getElementById('collab-generated-area');
        const selectionStage = document.getElementById('candidates-selection-stage');
        const confirmStage = document.getElementById('candidate-confirm-stage');
        
        if (generatedArea) {
            // Reset to Stage 1
            if (selectionStage) selectionStage.style.display = 'block';
            if (confirmStage) confirmStage.style.display = 'none';
            
            // Populate candidate textareas
            candidates.forEach((candidate, index) => {
                const candidateTextarea = document.querySelector(`#candidate-${index} .candidate-text`);
                if (candidateTextarea) {
                    candidateTextarea.value = candidate.output;
                }
            });
            generatedArea.style.display = 'block';
        }
        
        // Enable all select buttons
        document.querySelectorAll('.select-candidate-btn').forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
        });
        
        // Enable regenerate button
        const regenerateBtn = document.getElementById('regenerate-btn');
        if (regenerateBtn) {
            regenerateBtn.disabled = false;
            regenerateBtn.style.opacity = '1';
        }

        // Update state
        AppState.currentState = await backend.getCurrentState(AppState.currentToken);
    } catch (error) {
        console.error('Generation failed:', error);
        alert('Generation failed. Please try again.');
        // Re-enable generate button on error
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generate';
        }
    }
}

/**
 * Handle select a specific candidate (Stage 1 -> Stage 2)
 * @param {number} candidateIndex - Index of the selected candidate
 */
async function handleSelectCandidate(candidateIndex) {
    const taskIndex = AppState.currentTaskIndex;
    const task = AppState.assignment.tasks[taskIndex - 1];
    
    // Get the text from the selected candidate
    const candidateTextarea = document.querySelector(`#candidate-${candidateIndex} .candidate-text`);
    const selectedText = candidateTextarea ? candidateTextarea.value.trim() : '';
    
    if (!selectedText) {
        alert('Cannot select empty text.');
        return;
    }

    // Get fresh state
    const state = await backend.getCurrentState(AppState.currentToken);
    AppState.currentState = state;
    const taskState = state.tasks[taskIndex] || {};
    const rounds = [...(taskState.collabRounds || [])];

    // Update the pending round with selected candidate
    const pendingRound = rounds.find(r => r.status === 'pending');
    if (pendingRound) {
        pendingRound.selectedCandidateIndex = candidateIndex;
    }

    await backend.saveState(AppState.currentToken, taskIndex, {
        collabRounds: rounds
    });

    await backend.appendEvent({
        participant_token: AppState.currentToken,
        participant_id: AppState.assignment.participantId,
        task_index: taskIndex,
        paper_id: task.paperId,
        paradigm: task.paradigm,
        round_id: pendingRound?.roundId,
        event_type: 'select_candidate',
        payload: { selectedCandidateIndex: candidateIndex },
        timestamp: new Date().toISOString()
    });

    // Hide Stage 1, show Stage 2
    const selectionStage = document.getElementById('candidates-selection-stage');
    const confirmStage = document.getElementById('candidate-confirm-stage');
    const selectedTextarea = document.getElementById('selected-candidate-text');
    
    if (selectionStage) selectionStage.style.display = 'none';
    if (confirmStage) confirmStage.style.display = 'block';
    if (selectedTextarea) selectedTextarea.value = selectedText;

    // IMPORTANT: Re-enable Accept/Reject buttons (they may have been disabled from previous reject)
    const acceptBtn = document.getElementById('accept-selected-btn');
    const rejectBtn = document.getElementById('reject-selected-btn');
    if (acceptBtn) {
        acceptBtn.disabled = false;
        acceptBtn.style.opacity = '1';
    }
    if (rejectBtn) {
        rejectBtn.disabled = false;
        rejectBtn.style.opacity = '1';
    }

    AppState.currentState = await backend.getCurrentState(AppState.currentToken);
}

/**
 * Handle accept the selected candidate (Stage 2 -> Done)
 */
async function handleAcceptSelected() {
    const taskIndex = AppState.currentTaskIndex;
    const task = AppState.assignment.tasks[taskIndex - 1];
    
    // Get the edited text from the selected textarea
    const selectedTextarea = document.getElementById('selected-candidate-text');
    const editedOutput = selectedTextarea ? selectedTextarea.value.trim() : '';
    
    if (!editedOutput) {
        alert('Cannot accept empty text.');
        return;
    }

    // Get fresh state
    const state = await backend.getCurrentState(AppState.currentToken);
    AppState.currentState = state;
    const taskState = state.tasks[taskIndex] || {};
    const rounds = [...(taskState.collabRounds || [])];

    // Find and update the pending round
    const pendingRound = rounds.find(r => r.status === 'pending');
    const candidateIndex = pendingRound?.selectedCandidateIndex || 0;
    
    if (pendingRound) {
        pendingRound.status = 'accepted';
        pendingRound.output = editedOutput;
        pendingRound.editedOutput = editedOutput;
    }

    // Append to final review
    const editor = document.getElementById('review-editor');
    if (editor) {
        const existingContent = editor.value.trim();
        if (existingContent) {
            editor.value = existingContent + '\n\n' + editedOutput;
        } else {
            editor.value = editedOutput;
        }
    }

    await backend.saveState(AppState.currentToken, taskIndex, {
        collabRounds: rounds,
        draftText: editor ? editor.value : ''
    });

    await backend.appendEvent({
        participant_token: AppState.currentToken,
        participant_id: AppState.assignment.participantId,
        task_index: taskIndex,
        paper_id: task.paperId,
        paradigm: task.paradigm,
        round_id: pendingRound?.roundId,
        event_type: 'accept',
        payload: { selectedCandidateIndex: candidateIndex },
        timestamp: new Date().toISOString()
    });

    // Get judgment text before clearing
    const judgmentInput = document.getElementById('judgment-input');
    const judgmentText = judgmentInput ? judgmentInput.value.trim() : '';
    
    // Get the original candidate output for history
    const originalOutput = pendingRound?.candidates?.[candidateIndex]?.output || editedOutput;
    
    // Create judgment history
    const acceptedCount = rounds.filter(r => r.status === 'accepted').length;
    createJudgmentHistory(acceptedCount, judgmentText, originalOutput, editedOutput, 'accepted');
    
    // Reset UI
    const generatedArea = document.getElementById('collab-generated-area');
    const selectionStage = document.getElementById('candidates-selection-stage');
    const confirmStage = document.getElementById('candidate-confirm-stage');
    
    if (generatedArea) generatedArea.style.display = 'none';
    if (selectionStage) selectionStage.style.display = 'block';
    if (confirmStage) confirmStage.style.display = 'none';

    // Re-enable Accept/Reject buttons for next use
    const acceptBtn = document.getElementById('accept-selected-btn');
    const rejectBtn = document.getElementById('reject-selected-btn');
    if (acceptBtn) {
        acceptBtn.disabled = false;
        acceptBtn.style.opacity = '1';
    }
    if (rejectBtn) {
        rejectBtn.disabled = false;
        rejectBtn.style.opacity = '1';
    }

    // Update judgment label for next judgment
    const judgmentLabel = document.getElementById('judgment-label');
    if (judgmentLabel) {
        judgmentLabel.textContent = `Judgment ${acceptedCount + 1}:`;
    }

    // Clear and show judgment input
    if (judgmentInput) judgmentInput.value = '';
    
    const collabInputArea = document.getElementById('collab-input-area');
    if (collabInputArea) collabInputArea.style.display = 'block';
    
    const generateBtn = document.getElementById('generate-btn');
    if (generateBtn) {
        generateBtn.style.display = 'inline-block';
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate';
    }

    AppState.currentState = await backend.getCurrentState(AppState.currentToken);
}

/**
 * Handle reject the selected candidate (Stage 2 -> Feedback flow)
 */
async function handleRejectSelected() {
    const taskIndex = AppState.currentTaskIndex;
    const task = AppState.assignment.tasks[taskIndex - 1];
    
    // Get fresh state
    const state = await backend.getCurrentState(AppState.currentToken);
    AppState.currentState = state;
    const taskState = state.tasks[taskIndex] || {};
    const rounds = [...(taskState.collabRounds || [])];

    // Find and update the pending round
    const pendingRound = rounds.find(r => r.status === 'pending');
    if (pendingRound) {
        pendingRound.status = 'rejected';
    }

    await backend.saveState(AppState.currentToken, taskIndex, {
        collabRounds: rounds
    });

    await backend.appendEvent({
        participant_token: AppState.currentToken,
        participant_id: AppState.assignment.participantId,
        task_index: taskIndex,
        paper_id: task.paperId,
        paradigm: task.paradigm,
        round_id: pendingRound?.roundId,
        event_type: 'reject',
        timestamp: new Date().toISOString()
    });

    // Disable Accept/Reject buttons
    const acceptBtn = document.getElementById('accept-selected-btn');
    const rejectBtn = document.getElementById('reject-selected-btn');
    if (acceptBtn) {
        acceptBtn.disabled = true;
        acceptBtn.style.opacity = '0.5';
    }
    if (rejectBtn) {
        rejectBtn.disabled = true;
        rejectBtn.style.opacity = '0.5';
    }

    // Create and show feedback area
    createFeedbackArea('collab-rounds-container');
    
    // Show generate button
    const generateBtn = document.getElementById('generate-btn');
    if (generateBtn) {
        generateBtn.style.display = 'inline-block';
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate';
    }

    AppState.currentState = await backend.getCurrentState(AppState.currentToken);
}

/**
 * Handle regenerate all candidates (generate new batch)
 */
async function handleRegenerate() {
    const taskIndex = AppState.currentTaskIndex;
    const task = AppState.assignment.tasks[taskIndex - 1];
    
    // Get fresh state
    const state = await backend.getCurrentState(AppState.currentToken);
    AppState.currentState = state;
    const taskState = state.tasks[taskIndex] || {};
    const rounds = [...(taskState.collabRounds || [])];

    // Remove the pending round (we're regenerating)
    const pendingIndex = rounds.findIndex(r => r.status === 'pending');
    if (pendingIndex !== -1) {
        rounds.splice(pendingIndex, 1);
    }

    await backend.saveState(AppState.currentToken, taskIndex, {
        collabRounds: rounds
    });

    await backend.appendEvent({
        participant_token: AppState.currentToken,
        participant_id: AppState.assignment.participantId,
        task_index: taskIndex,
        paper_id: task.paperId,
        paradigm: task.paradigm,
        event_type: 'regenerate',
        timestamp: new Date().toISOString()
    });

    // Hide generated area
    const generatedArea = document.getElementById('collab-generated-area');
    if (generatedArea) generatedArea.style.display = 'none';
    
    // Show generate button and trigger generation
    const generateBtn = document.getElementById('generate-btn');
    if (generateBtn) {
        generateBtn.style.display = 'inline-block';
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate';
    }
    
    // Trigger new generation
    handleGenerate();
}

/**
 * Restore judgment history from saved collabRounds data
 */
function restoreJudgmentHistory(rounds) {
    const historyContainer = document.getElementById('judgment-history-container');
    if (!historyContainer || !rounds || rounds.length === 0) return;
    
    // Clear existing history
    historyContainer.innerHTML = '';
    
    // Group rounds by judgmentNum
    const judgmentGroups = {};
    for (const round of rounds) {
        const num = round.judgmentNum || 1;
        if (!judgmentGroups[num]) {
            judgmentGroups[num] = [];
        }
        judgmentGroups[num].push(round);
    }
    
    // Get max judgmentNum to determine which judgments are complete
    const maxJudgmentNum = Math.max(...Object.keys(judgmentGroups).map(Number));
    
    // Process each judgment group
    for (const judgmentNum of Object.keys(judgmentGroups).sort((a, b) => a - b)) {
        const groupRounds = judgmentGroups[judgmentNum];
        const lastRound = groupRounds[groupRounds.length - 1];
        const numericJudgmentNum = Number(judgmentNum);
        
        // Only show completed judgments (accepted or stopped/rejected)
        if (lastRound.status === 'pending') continue;
        
        // If the last round is rejected, check if it's truly completed
        if (lastRound.status === 'rejected' && !lastRound.stoppedManually) {
            // If there's a higher judgmentNum, this judgment is implicitly stopped
            if (numericJudgmentNum < maxJudgmentNum) {
                // Implicitly stopped - user moved on to next judgment
            } else {
                // This is the current judgment, still in progress
                continue;
            }
        }
        
        // Build history content
        const judgmentText = groupRounds[0].judgment || '';
        let contentHtml = `
            <div class="history-item">
                <div class="history-item-label">Judgment:</div>
                <div class="history-item-text">${escapeHtml(judgmentText)}</div>
            </div>
        `;
        
        let expansionCount = 1;
        let feedbackCount = 1;
        
        for (const round of groupRounds) {
            // Add expansion
            if (round.output) {
                contentHtml += `
                    <div class="history-item history-expansion">
                        <div class="history-item-label">Expansion ${expansionCount}:</div>
                        <div class="history-item-text">${escapeHtml(round.editedOutput || round.output)}</div>
                    </div>
                `;
                expansionCount++;
            }
            
            // Add feedback (if rejected and has feedback)
            if (round.status === 'rejected' && round.feedback) {
                contentHtml += `
                    <div class="history-item history-feedback">
                        <div class="history-item-label">Feedback ${feedbackCount}:</div>
                        <div class="history-item-text">${escapeHtml(round.feedback)}</div>
                    </div>
                `;
                feedbackCount++;
            }
        }
        
        // Determine outcome
        const outcome = lastRound.status === 'accepted' ? 'Accepted' : 'Rejected';
        
        const historyId = 'history-restored-' + judgmentNum;
        const historyElement = document.createElement('div');
        historyElement.className = 'judgment-history-container collapsed';
        historyElement.id = historyId;
        historyElement.innerHTML = `
            <div class="judgment-history-header">
                <span>Judgment ${judgmentNum} (${outcome})</span>
                <span class="toggle-icon">▼</span>
            </div>
            <div class="judgment-history-content">
                ${contentHtml}
            </div>
        `;
        
        historyContainer.appendChild(historyElement);
        
        // Add toggle event listener
        const header = historyElement.querySelector('.judgment-history-header');
        header.addEventListener('click', () => {
            historyElement.classList.toggle('collapsed');
        });
    }
}

/**
 * Create a collapsible judgment history
 */
function createJudgmentHistory(judgmentNum, judgmentText, initialExpansion, finalText, outcome) {
    const historyContainer = document.getElementById('judgment-history-container');
    if (!historyContainer) return;
    
    // Build content in order: judgment → expansion 1 → feedback 1 → expansion 2 → feedback 2...
    let contentHtml = `
        <div class="history-item">
            <div class="history-item-label">Judgment:</div>
            <div class="history-item-text">${escapeHtml(judgmentText)}</div>
        </div>
        <div class="history-item history-expansion">
            <div class="history-item-label">Expansion 1:</div>
            <div class="history-item-text">${escapeHtml(initialExpansion)}</div>
        </div>
    `;
    
    // Get dynamic rounds content in order
    const roundsContainer = document.getElementById('collab-rounds-container');
    if (roundsContainer) {
        // Get all children in order (feedback and expansion areas are interleaved)
        const children = roundsContainer.children;
        let feedbackCount = 1;
        let expansionCount = 2; // Start at 2 since initial expansion is 1
        
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            
            if (child.classList.contains('feedback-area')) {
                const feedbackInput = child.querySelector('.feedback-input');
                const feedbackText = feedbackInput ? feedbackInput.value : '';
                if (feedbackText) {
                    contentHtml += `
                        <div class="history-item history-feedback">
                            <div class="history-item-label">Feedback ${feedbackCount}:</div>
                            <div class="history-item-text">${escapeHtml(feedbackText)}</div>
                        </div>
                    `;
                }
                feedbackCount++;
            } else if (child.classList.contains('new-expansion-area')) {
                const expansionText = child.querySelector('.expansion-text');
                const text = expansionText ? expansionText.value : '';
                if (text) {
                    contentHtml += `
                        <div class="history-item history-expansion">
                            <div class="history-item-label">Expansion ${expansionCount}:</div>
                            <div class="history-item-text">${escapeHtml(text)}</div>
                        </div>
                    `;
                }
                expansionCount++;
            }
        }
        
        // Clear the rounds container
        roundsContainer.innerHTML = '';
    }
    
    const historyId = 'history-' + Date.now();
    const outcomeText = outcome === 'accepted' ? 'Accepted' : 'Rejected';
    
    const historyElement = document.createElement('div');
    historyElement.className = 'judgment-history-container collapsed';
    historyElement.id = historyId;
    historyElement.innerHTML = `
        <div class="judgment-history-header">
            <span>Judgment ${judgmentNum} (${outcomeText})</span>
            <span class="toggle-icon">▼</span>
        </div>
        <div class="judgment-history-content">
            ${contentHtml}
        </div>
    `;
    
    historyContainer.appendChild(historyElement);
    
    // Add toggle event listener
    const header = historyElement.querySelector('.judgment-history-header');
    header.addEventListener('click', () => {
        historyElement.classList.toggle('collapsed');
    });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Create a feedback area dynamically
 */
function createFeedbackArea(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const feedbackId = 'feedback-' + Date.now();
    
    const feedbackArea = document.createElement('div');
    feedbackArea.className = 'feedback-area';
    feedbackArea.id = feedbackId;
    feedbackArea.innerHTML = `
        <button class="close-feedback-btn" title="Cancel feedback">&times;</button>
        <div class="collab-input-group">
            <label>Feedback for revision (optional):</label>
            <textarea class="feedback-input" rows="2"></textarea>
        </div>
        <div class="reject-actions">
            <button class="btn btn-primary feedback-generate-btn">Generate</button>
            <button class="btn btn-secondary feedback-stop-btn">Stop</button>
        </div>
    `;
    
    container.appendChild(feedbackArea);
    
    // Add event listeners
    const closeBtn = feedbackArea.querySelector('.close-feedback-btn');
    const generateBtn = feedbackArea.querySelector('.feedback-generate-btn');
    const stopBtn = feedbackArea.querySelector('.feedback-stop-btn');
    const feedbackInput = feedbackArea.querySelector('.feedback-input');
    
    closeBtn.addEventListener('click', () => handleCloseDynamicFeedback(feedbackId));
    generateBtn.addEventListener('click', () => handleDynamicGenerate(feedbackId));
    stopBtn.addEventListener('click', () => handleDynamicStop(feedbackId));
    
    // Add Enter key shortcut for generate
    if (feedbackInput) {
        feedbackInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleDynamicGenerate(feedbackId);
            }
        });
    }
}

/**
 * Handle close dynamic feedback area
 */
function handleCloseDynamicFeedback(feedbackId) {
    const feedbackArea = document.getElementById(feedbackId);
    if (feedbackArea) {
        feedbackArea.remove();
    }
    
    // Re-enable last Accept/Reject buttons
    reEnableLastAcceptRejectButtons();
}

/**
 * Re-enable the last Accept/Reject buttons (either original or dynamically created)
 */
function reEnableLastAcceptRejectButtons() {
    // First check for dynamically created expansion areas
    const container = document.getElementById('collab-rounds-container');
    if (container) {
        const expansionAreas = container.querySelectorAll('.new-expansion-area');
        if (expansionAreas.length > 0) {
            const lastExpansion = expansionAreas[expansionAreas.length - 1];
            const acceptBtn = lastExpansion.querySelector('.expansion-accept-btn');
            const rejectBtn = lastExpansion.querySelector('.expansion-reject-btn');
            if (acceptBtn) {
                acceptBtn.disabled = false;
                acceptBtn.style.opacity = '1';
            }
            if (rejectBtn) {
                rejectBtn.disabled = false;
                rejectBtn.style.opacity = '1';
            }
            return;
        }
    }
    
    // Otherwise re-enable Stage 2 Accept/Reject buttons
    const acceptSelectedBtn = document.getElementById('accept-selected-btn');
    const rejectSelectedBtn = document.getElementById('reject-selected-btn');
    if (acceptSelectedBtn) {
        acceptSelectedBtn.disabled = false;
        acceptSelectedBtn.style.opacity = '1';
    }
    if (rejectSelectedBtn) {
        rejectSelectedBtn.disabled = false;
        rejectSelectedBtn.style.opacity = '1';
    }
}

/**
 * Handle dynamic generate (from feedback area)
 */
async function handleDynamicGenerate(feedbackId) {
    const feedbackArea = document.getElementById(feedbackId);
    if (!feedbackArea) return;
    
    const feedbackInput = feedbackArea.querySelector('.feedback-input');
    const feedback = feedbackInput ? feedbackInput.value.trim() : '';
    
    // Make input readonly during generation
    if (feedbackInput) feedbackInput.readOnly = true;
    
    // Disable buttons
    const generateBtn = feedbackArea.querySelector('.feedback-generate-btn');
    const stopBtn = feedbackArea.querySelector('.feedback-stop-btn');
    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';
    }
    if (stopBtn) stopBtn.disabled = true;
    
    const taskIndex = AppState.currentTaskIndex;
    const task = AppState.assignment.tasks.find(t => t.index === taskIndex);
    
    // Get fresh state
    const state = await backend.getCurrentState(AppState.currentToken);
    AppState.currentState = state;
    const taskState = state.tasks[taskIndex] || {};
    const rounds = [...(taskState.collabRounds || [])];
    
    // Update the last rejected round with feedback
    if (rounds.length > 0) {
        const lastRound = rounds[rounds.length - 1];
        if (lastRound.status === 'rejected') {
            lastRound.feedback = feedback;
        }
    }
    
    // Get judgment from input field
    const judgmentInput = document.getElementById('judgment-input');
    const judgment = judgmentInput ? judgmentInput.value.trim() : '';
    
    try {
        const modelOutput = await CollabSimulator.generateRound(
            task.paperId,
            rounds,
            judgment,
            feedback
        );

        // Add new round
        const acceptedCount = rounds.filter(r => r.status === 'accepted').length;
        const newRound = {
            roundId: rounds.length + 1,
            judgmentNum: acceptedCount + 1,
            judgment: judgment,
            feedback: feedback,
            output: modelOutput,
            status: 'pending',
            timestamp: new Date().toISOString()
        };

        const updatedRounds = [...rounds, newRound];
        await backend.saveState(AppState.currentToken, taskIndex, {
            collabRounds: updatedRounds,
            judgment: judgment
        });
        
        // Hide Generate/Stop buttons in feedback area
        if (generateBtn) generateBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'none';
        
        // Create new expansion area below the feedback area
        createExpansionArea(feedbackArea, modelOutput);

        AppState.currentState = await backend.getCurrentState(AppState.currentToken);
    } catch (error) {
        console.error('Generation failed:', error);
        alert('Generation failed. Please try again.');
        // Re-enable buttons on error
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generate';
        }
        if (stopBtn) stopBtn.disabled = false;
        if (feedbackInput) feedbackInput.readOnly = false;
    }
}

/**
 * Create a new expansion area after a feedback area
 */
function createExpansionArea(feedbackArea, modelOutput) {
    const expansionId = 'expansion-' + Date.now();
    
    const expansionArea = document.createElement('div');
    expansionArea.className = 'new-expansion-area';
    expansionArea.id = expansionId;
    expansionArea.innerHTML = `
        <div class="collab-input-group">
            <label>New expansion:</label>
            <textarea class="expansion-text" rows="4">${modelOutput}</textarea>
        </div>
        <div class="new-expansion-actions">
            <button class="btn btn-primary expansion-accept-btn">Accept</button>
            <button class="btn btn-secondary expansion-reject-btn">Reject</button>
        </div>
    `;
    
    // Insert after the feedback area
    feedbackArea.parentNode.insertBefore(expansionArea, feedbackArea.nextSibling);
    
    // Add event listeners
    const acceptBtn = expansionArea.querySelector('.expansion-accept-btn');
    const rejectBtn = expansionArea.querySelector('.expansion-reject-btn');
    
    acceptBtn.addEventListener('click', () => handleDynamicAccept(expansionId));
    rejectBtn.addEventListener('click', () => handleDynamicReject(expansionId));
}

/**
 * Handle dynamic accept
 */
async function handleDynamicAccept(expansionId) {
    const expansionArea = document.getElementById(expansionId);
    if (!expansionArea) return;
    
    const expansionText = expansionArea.querySelector('.expansion-text');
    const editedOutput = expansionText ? expansionText.value.trim() : '';
    
    if (!editedOutput) {
        alert('Cannot accept empty text.');
        return;
    }
    
    const taskIndex = AppState.currentTaskIndex;
    const task = AppState.assignment.tasks.find(t => t.index === taskIndex);
    
    // Get judgment text before clearing
    const judgmentInput = document.getElementById('judgment-input');
    const judgmentText = judgmentInput ? judgmentInput.value.trim() : '';
    
    // Get fresh state
    const state = await backend.getCurrentState(AppState.currentToken);
    AppState.currentState = state;
    const taskState = state.tasks[taskIndex] || {};
    const rounds = [...(taskState.collabRounds || [])];
    
    // Get the initial expansion from the first round of this judgment
    const acceptedCount = rounds.filter(r => r.status === 'accepted').length;
    const currentJudgmentNum = acceptedCount + 1;
    const currentJudgmentRounds = rounds.filter(r => r.judgmentNum === currentJudgmentNum);
    
    let initialExpansion = '';
    if (currentJudgmentRounds.length > 0) {
        const firstRound = currentJudgmentRounds[0];
        if (firstRound.candidates && firstRound.selectedCandidateIndex !== null && firstRound.selectedCandidateIndex !== undefined) {
            initialExpansion = firstRound.candidates[firstRound.selectedCandidateIndex]?.output || '';
        } else if (firstRound.output) {
            initialExpansion = firstRound.output;
        }
    }
    
    // Fallback to selected-candidate-text if not found
    if (!initialExpansion) {
        const selectedTextEl = document.getElementById('selected-candidate-text');
        initialExpansion = selectedTextEl ? selectedTextEl.value : '';
    }

    // Find and update the pending round
    const pendingRound = rounds.find(r => r.status === 'pending');
    if (pendingRound) {
        pendingRound.status = 'accepted';
        pendingRound.editedOutput = editedOutput;
    }

    // Append to final review
    const editor = document.getElementById('review-editor');
    if (editor) {
        const existingContent = editor.value.trim();
        if (existingContent) {
            editor.value = existingContent + '\n\n' + editedOutput;
        } else {
            editor.value = editedOutput;
        }
    }

    await backend.saveState(AppState.currentToken, taskIndex, {
        collabRounds: rounds,
        draftText: editor ? editor.value : ''
    });

    await backend.appendEvent({
        participant_token: AppState.currentToken,
        participant_id: AppState.assignment.participantId,
        task_index: taskIndex,
        paper_id: task.paperId,
        paradigm: task.paradigm,
        round_id: pendingRound?.roundId,
        event_type: 'accept',
        timestamp: new Date().toISOString()
    });

    // Create judgment history before clearing (note: createJudgmentHistory will clear collab-rounds-container)
    const finalAcceptedCount = rounds.filter(r => r.status === 'accepted').length;
    createJudgmentHistory(finalAcceptedCount, judgmentText, initialExpansion, editedOutput, 'accepted');
    
    // Hide original generated area
    const generatedArea = document.getElementById('collab-generated-area');
    if (generatedArea) generatedArea.style.display = 'none';
    
    // Reset Stage 2 for next use
    const selectionStage = document.getElementById('candidates-selection-stage');
    const confirmStage = document.getElementById('candidate-confirm-stage');
    if (selectionStage) selectionStage.style.display = 'block';
    if (confirmStage) confirmStage.style.display = 'none';
    
    // Re-enable Accept/Reject buttons for next use
    const acceptBtn = document.getElementById('accept-selected-btn');
    const rejectBtn = document.getElementById('reject-selected-btn');
    if (acceptBtn) {
        acceptBtn.disabled = false;
        acceptBtn.style.opacity = '1';
    }
    if (rejectBtn) {
        rejectBtn.disabled = false;
        rejectBtn.style.opacity = '1';
    }

    // Update judgment label for next judgment
    const judgmentLabel = document.getElementById('judgment-label');
    if (judgmentLabel) {
        judgmentLabel.textContent = `Judgment ${finalAcceptedCount + 1}:`;
    }

    // Clear and show judgment input for next judgment
    if (judgmentInput) judgmentInput.value = '';
    
    const collabInputArea = document.getElementById('collab-input-area');
    if (collabInputArea) collabInputArea.style.display = 'block';
    
    const generateBtn = document.getElementById('generate-btn');
    if (generateBtn) {
        generateBtn.style.display = 'inline-block';
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate';
    }

    AppState.currentState = await backend.getCurrentState(AppState.currentToken);
}

/**
 * Handle dynamic reject
 */
async function handleDynamicReject(expansionId) {
    const expansionArea = document.getElementById(expansionId);
    if (!expansionArea) return;
    
    const taskIndex = AppState.currentTaskIndex;
    const task = AppState.assignment.tasks.find(t => t.index === taskIndex);
    
    // Get fresh state
    const state = await backend.getCurrentState(AppState.currentToken);
    AppState.currentState = state;
    const taskState = state.tasks[taskIndex] || {};
    const rounds = [...(taskState.collabRounds || [])];

    // Find and update the pending round to rejected
    const pendingRound = rounds.find(r => r.status === 'pending');
    if (pendingRound) {
        pendingRound.status = 'rejected';
    }

    await backend.saveState(AppState.currentToken, taskIndex, {
        collabRounds: rounds
    });

    await backend.appendEvent({
        participant_token: AppState.currentToken,
        participant_id: AppState.assignment.participantId,
        task_index: taskIndex,
        paper_id: task.paperId,
        paradigm: task.paradigm,
        round_id: pendingRound?.roundId,
        event_type: 'reject',
        timestamp: new Date().toISOString()
    });

    // Disable Accept/Reject buttons
    const acceptBtn = expansionArea.querySelector('.expansion-accept-btn');
    const rejectBtn = expansionArea.querySelector('.expansion-reject-btn');
    if (acceptBtn) {
        acceptBtn.disabled = true;
        acceptBtn.style.opacity = '0.5';
    }
    if (rejectBtn) {
        rejectBtn.disabled = true;
        rejectBtn.style.opacity = '0.5';
    }

    // Create new feedback area below the expansion
    const container = document.getElementById('collab-rounds-container');
    if (container) {
        createFeedbackArea('collab-rounds-container');
    }

    AppState.currentState = await backend.getCurrentState(AppState.currentToken);
}

/**
 * Handle dynamic stop
 */
async function handleDynamicStop(feedbackId) {
    // Get judgment text before clearing
    const judgmentInput = document.getElementById('judgment-input');
    const judgmentText = judgmentInput ? judgmentInput.value.trim() : '';
    
    // Get state for counting and expansion data
    const taskIndex = AppState.currentTaskIndex;
    const task = AppState.assignment.tasks.find(t => t.index === taskIndex);
    const state = await backend.getCurrentState(AppState.currentToken);
    AppState.currentState = state;
    const taskState = state.tasks[taskIndex] || {};
    const rounds = [...(taskState.collabRounds || [])];
    const acceptedCount = rounds.filter(r => r.status === 'accepted').length;
    
    // Find the current judgment's rounds (all rounds with the same judgmentNum)
    const currentJudgmentNum = acceptedCount + 1;
    const currentJudgmentRounds = rounds.filter(r => r.judgmentNum === currentJudgmentNum);
    
    // Get the first expansion from this judgment (from selected candidate or first round's output)
    let initialExpansion = '';
    if (currentJudgmentRounds.length > 0) {
        const firstRound = currentJudgmentRounds[0];
        if (firstRound.candidates && firstRound.selectedCandidateIndex !== null && firstRound.selectedCandidateIndex !== undefined) {
            initialExpansion = firstRound.candidates[firstRound.selectedCandidateIndex]?.output || '';
        } else if (firstRound.output) {
            initialExpansion = firstRound.output;
        }
    }
    
    // Also try to get from the current UI if not found in rounds
    if (!initialExpansion) {
        const selectedTextEl = document.getElementById('selected-candidate-text');
        initialExpansion = selectedTextEl ? selectedTextEl.value : '';
    }
    
    // Mark the last round as stopped
    if (rounds.length > 0) {
        const lastRound = rounds[rounds.length - 1];
        lastRound.stoppedManually = true;
    }
    
    // Save the updated rounds
    await backend.saveState(AppState.currentToken, taskIndex, {
        collabRounds: rounds
    });
    
    // Record stop event
    await backend.appendEvent({
        participant_token: AppState.currentToken,
        participant_id: AppState.assignment.participantId,
        task_index: taskIndex,
        paper_id: task?.paperId,
        paradigm: task?.paradigm,
        event_type: 'stop',
        timestamp: new Date().toISOString()
    });
    
    // Create judgment history using the CURRENT judgment number (not acceptedCount + 1 for next)
    createJudgmentHistory(currentJudgmentNum, judgmentText, initialExpansion, '', 'stopped');
    
    // Hide original generated area
    const generatedArea = document.getElementById('collab-generated-area');
    if (generatedArea) generatedArea.style.display = 'none';
    
    // Reset Stage 2 for next use - hide confirm stage, show selection stage
    const selectionStage = document.getElementById('candidates-selection-stage');
    const confirmStage = document.getElementById('candidate-confirm-stage');
    if (selectionStage) selectionStage.style.display = 'block';
    if (confirmStage) confirmStage.style.display = 'none';
    
    // Re-enable Accept/Reject buttons for next use
    const acceptBtn = document.getElementById('accept-selected-btn');
    const rejectBtn = document.getElementById('reject-selected-btn');
    if (acceptBtn) {
        acceptBtn.disabled = false;
        acceptBtn.style.opacity = '1';
    }
    if (rejectBtn) {
        rejectBtn.disabled = false;
        rejectBtn.style.opacity = '1';
    }
    
    // Show judgment input area
    const collabInputArea = document.getElementById('collab-input-area');
    if (collabInputArea) collabInputArea.style.display = 'block';
    
    // Clear judgment input
    if (judgmentInput) judgmentInput.value = '';
    
    // Show generate button
    const generateBtn = document.getElementById('generate-btn');
    if (generateBtn) {
        generateBtn.style.display = 'inline-block';
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate';
    }
    
    // Update judgment label for NEXT judgment
    const judgmentLabel = document.getElementById('judgment-label');
    if (judgmentLabel) {
        judgmentLabel.textContent = `Judgment ${currentJudgmentNum + 1}:`;
    }
}

/**
 * Render collaboration rounds (legacy - kept for compatibility)
 */
function renderCollabRounds(rounds) {
    const container = document.getElementById('collab-rounds');
    if (!container) return;
    
    // Clear container completely
    container.innerHTML = '';

    // Ensure rounds is an array
    if (!Array.isArray(rounds)) {
        rounds = [];
    }

    // Only show the last pending round
    const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
    
    if (lastRound && lastRound.status === 'pending') {
        const roundDiv = document.createElement('div');
        roundDiv.className = 'collab-round';

        roundDiv.innerHTML = `
            <div class="collab-round-content">${escapeHtml(lastRound.output)}</div>
                <div class="round-actions">
                <button class="btn btn-primary" onclick="handleAcceptRound(${lastRound.roundId})">Accept</button>
                <button class="btn btn-secondary" onclick="handleRejectRound(${lastRound.roundId})">Reject</button>
                </div>
        `;

        container.appendChild(roundDiv);
    }
}

/**
 * Handle accept round
 */
async function handleAcceptRound(roundId) {
    const taskIndex = AppState.currentTaskIndex;
    const task = AppState.assignment.tasks[taskIndex - 1];
    
    // Get fresh state
    const state = await backend.getCurrentState(AppState.currentToken);
    AppState.currentState = state;
    const taskState = state.tasks[taskIndex] || {};
    const rounds = [...(taskState.collabRounds || [])];

    const round = rounds.find(r => r.roundId === roundId);
    if (!round || round.status !== 'pending') return;

    round.status = 'accepted';
    const editor = document.getElementById('review-editor');
    
    // Check if this is the first round (editor is empty) or subsequent rounds
    const existingContent = editor.value.trim();
    if (existingContent) {
        // Subsequent rounds: append to existing content
        editor.value = existingContent + '\n\n' + round.output;
    } else {
        // First round: replace content
    editor.value = round.output;
    }

    await backend.saveState(AppState.currentToken, taskIndex, {
        collabRounds: rounds,
        draftText: editor.value
    });

    await backend.appendEvent({
        participant_token: AppState.currentToken,
        participant_id: AppState.assignment.participantId,
        task_index: taskIndex,
        paper_id: task.paperId,
        paradigm: task.paradigm,
        round_id: roundId,
        event_type: 'accept',
        timestamp: new Date().toISOString()
    });

    // Clear judgment input
    const judgmentInput = document.getElementById('judgment-input');
    if (judgmentInput) judgmentInput.value = '';

    // Show generate button for next round
    const generateBtn = document.getElementById('generate-btn');
    if (generateBtn) generateBtn.style.display = 'inline-block';

    // Hide reject feedback area if visible
    const rejectFeedbackArea = document.getElementById('reject-feedback-area');
    if (rejectFeedbackArea) rejectFeedbackArea.style.display = 'none';

    AppState.currentState = await backend.getCurrentState(AppState.currentToken);
    
    // Hide the round display when accepted (content is in editor)
    const container = document.getElementById('collab-rounds');
    if (container) container.innerHTML = '';
}

/**
 * Handle reject round
 */
async function handleRejectRound(roundId) {
    const taskIndex = AppState.currentTaskIndex;
    const task = AppState.assignment.tasks[taskIndex - 1];
    
    // Get fresh state
    const state = await backend.getCurrentState(AppState.currentToken);
    AppState.currentState = state;
    const taskState = state.tasks[taskIndex] || {};
    const rounds = [...(taskState.collabRounds || [])];

    const round = rounds.find(r => r.roundId === roundId);
    if (!round || round.status !== 'pending') return;

    round.status = 'rejected';
    round.feedback = '';

    await backend.saveState(AppState.currentToken, taskIndex, {
        collabRounds: rounds
    });

    await backend.appendEvent({
        participant_token: AppState.currentToken,
        participant_id: AppState.assignment.participantId,
        task_index: taskIndex,
        paper_id: task.paperId,
        paradigm: task.paradigm,
        round_id: roundId,
        event_type: 'reject',
        timestamp: new Date().toISOString()
    });

    AppState.currentState = await backend.getCurrentState(AppState.currentToken);
    
    // Hide the generated review when rejected (it will be regenerated)
    const container = document.getElementById('collab-rounds');
    if (container) container.innerHTML = '';
    
    // Ensure generate button is visible (user can change judgment and regenerate)
    const generateBtn = document.getElementById('generate-btn');
    if (generateBtn) generateBtn.style.display = 'inline-block';
    
    // Show reject feedback area for next round interaction
    const rejectFeedbackArea = document.getElementById('reject-feedback-area');
    if (rejectFeedbackArea) {
        rejectFeedbackArea.style.display = 'block';
        // Clear previous feedback
        const feedbackInput = document.getElementById('reject-feedback-input');
        if (feedbackInput) feedbackInput.value = '';
    }
}

/**
 * Handle editor input
 */
function handleEditorInput() {
    // Trigger autosave (delayed to avoid frequent saves)
    clearTimeout(window.autosaveTimeout);
    window.autosaveTimeout = setTimeout(() => {
        autosaveDraft();
    }, 500);
}


/**
 * Start autosave
 */
function startAutosave() {
    if (AppState.autosaveInterval) {
        clearInterval(AppState.autosaveInterval);
    }
    
    AppState.autosaveInterval = setInterval(() => {
        autosaveDraft();
    }, 15000); // Autosave every 15 seconds
}

/**
 * Autosave draft
 */
async function autosaveDraft() {
    if (!AppState.currentTaskIndex) return;

    const editor = document.getElementById('review-editor');
    const taskIndex = AppState.currentTaskIndex;
    const task = AppState.assignment.tasks[taskIndex - 1];
    const state = AppState.currentState;
    const taskState = state.tasks[taskIndex] || {};
    
    const draftText = editor.value;
    const collabRounds = taskState.collabRounds || [];

    // Save judgment for collaborative mode
    let judgment = '';
    if (task && task.paradigm === 'collab') {
        const judgmentInput = document.getElementById('judgment-input');
        judgment = judgmentInput ? judgmentInput.value : '';
    }

    try {
        await backend.saveState(AppState.currentToken, taskIndex, {
            draftText,
            collabRounds,
            judgment
        });
        
        AppState.currentState = await backend.getCurrentState(AppState.currentToken);
    } catch (error) {
        console.error('Autosave failed:', error);
    }
}

/**
 * Handle pause writing
 */
async function handlePauseWriting() {
    if (!AppState.currentTaskIndex) return;

    const taskIndex = AppState.currentTaskIndex;
    const task = AppState.assignment.tasks[taskIndex - 1];
    const state = AppState.currentState;
    const taskState = state.tasks[taskIndex] || {};
    const timestamp = new Date().toISOString();

    const pauseTimestamps = (taskState.pauseTimestamps || []).concat(timestamp);
    const resumeTimestamps = taskState.resumeTimestamps || [];

    try {
        await backend.saveState(AppState.currentToken, taskIndex, {
            pauseTimestamps,
            resumeTimestamps
        });

        await backend.appendEvent({
            participant_token: AppState.currentToken,
            participant_id: AppState.assignment.participantId,
            task_index: taskIndex,
            paper_id: task.paperId,
            paradigm: task.paradigm,
            event_type: 'pause_writing',
            timestamp
        });

        AppState.currentState = await backend.getCurrentState(AppState.currentToken);

        document.getElementById('pause-writing-btn').style.display = 'none';
        document.getElementById('resume-writing-btn').style.display = 'inline-block';
    } catch (error) {
        console.error('Pause failed:', error);
        alert('Pause failed. Please try again.');
    }
}

/**
 * Handle resume writing
 */
async function handleResumeWriting() {
    if (!AppState.currentTaskIndex) return;

    const taskIndex = AppState.currentTaskIndex;
    const task = AppState.assignment.tasks[taskIndex - 1];
    const state = AppState.currentState;
    const taskState = state.tasks[taskIndex] || {};
    const timestamp = new Date().toISOString();

    const pauseTimestamps = taskState.pauseTimestamps || [];
    const resumeTimestamps = (taskState.resumeTimestamps || []).concat(timestamp);

    try {
        await backend.saveState(AppState.currentToken, taskIndex, {
            pauseTimestamps,
            resumeTimestamps
        });

        await backend.appendEvent({
            participant_token: AppState.currentToken,
            participant_id: AppState.assignment.participantId,
            task_index: taskIndex,
            paper_id: task.paperId,
            paradigm: task.paradigm,
            event_type: 'resume_writing',
            timestamp
        });

        AppState.currentState = await backend.getCurrentState(AppState.currentToken);

        document.getElementById('pause-writing-btn').style.display = 'inline-block';
        document.getElementById('resume-writing-btn').style.display = 'none';
    } catch (error) {
        console.error('Resume failed:', error);
        alert('Resume failed. Please try again.');
    }
}

/**
 * Handle submit review
 */
async function handleSubmitReview() {
    const editor = document.getElementById('review-editor');
    const reviewText = editor.value.trim();

    if (!reviewText) {
        alert('Please enter a review before submitting');
        return;
    }

    if (!confirm('Are you sure you want to submit the review? You will not be able to modify it after submission.')) {
        return;
    }

    const taskIndex = AppState.currentTaskIndex;
    const task = AppState.assignment.tasks[taskIndex - 1];
    const state = AppState.currentState;
    const taskState = state.tasks[taskIndex] || {};
    const timestamp = new Date().toISOString();

    // Stop autosave
    if (AppState.autosaveInterval) {
        clearInterval(AppState.autosaveInterval);
        AppState.autosaveInterval = null;
    }

    try {
        await backend.saveFinalReview(AppState.currentToken, taskIndex, reviewText, {
            taskStartTimestamp: taskState.taskStartTimestamp,
            writingStartTimestamp: taskState.writingStartTimestamp,
            submitTimestamp: timestamp
        });

        await backend.appendEvent({
            participant_token: AppState.currentToken,
            participant_id: AppState.assignment.participantId,
            task_index: taskIndex,
            paper_id: task.paperId,
            paradigm: task.paradigm,
            event_type: 'submit_review',
            payload: {
                review_length_chars: reviewText.length
            },
            timestamp
        });

        AppState.currentState = await backend.getCurrentState(AppState.currentToken);
        navigateTo('/questionnaire');
    } catch (error) {
        console.error('Submission failed:', error);
        alert('Submission failed. Please try again.');
    }
}

/**
 * Render questionnaire page
 */
function renderQuestionnaire() {
    if (!AppState.currentTaskIndex) {
        navigateTo('/overview');
        return;
    }

    // Reset form
    document.getElementById('questionnaire-form').reset();

    // Show/hide questions based on paradigm
    const task = AppState.assignment.tasks[AppState.currentTaskIndex - 1];
    const effortQuestion = document.getElementById('question-effort');
    const posteditEffortQuestion = document.getElementById('question-postedit-effort');
    
    if (task) {
        if (task.paradigm === 'scratch') {
            // Scratch: show only Effort
            effortQuestion.style.display = 'block';
            posteditEffortQuestion.style.display = 'none';
            // Set required for effort, remove for postedit
            effortQuestion.querySelectorAll('input[type="radio"]').forEach(input => input.required = true);
            posteditEffortQuestion.querySelectorAll('input[type="radio"]').forEach(input => input.required = false);
        } else if (task.paradigm === 'e2e') {
            // E2E: show only Post-edit effort
            effortQuestion.style.display = 'none';
            posteditEffortQuestion.style.display = 'block';
            // Set required for postedit, remove for effort
            effortQuestion.querySelectorAll('input[type="radio"]').forEach(input => input.required = false);
            posteditEffortQuestion.querySelectorAll('input[type="radio"]').forEach(input => input.required = true);
        } else if (task.paradigm === 'collab') {
            // Collab: show both Effort and Post-edit effort
            effortQuestion.style.display = 'block';
            posteditEffortQuestion.style.display = 'block';
            // Both required
            effortQuestion.querySelectorAll('input[type="radio"]').forEach(input => input.required = true);
            posteditEffortQuestion.querySelectorAll('input[type="radio"]').forEach(input => input.required = true);
        }
    }
}

/**
 * Handle questionnaire submit
 */
async function handleQuestionnaireSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const responses = {
        effort: formData.get('effort') ? parseInt(formData.get('effort')) : null,
        postedit_effort: formData.get('postedit_effort') ? parseInt(formData.get('postedit_effort')) : null,
        confidence: parseInt(formData.get('confidence')),
        satisfaction: parseInt(formData.get('satisfaction'))
    };

    const taskIndex = AppState.currentTaskIndex;
    const task = AppState.assignment.tasks[taskIndex - 1];
    const timestamp = new Date().toISOString();

    try {
        await backend.saveQuestionnaire(AppState.currentToken, taskIndex, responses);

        await backend.appendEvent({
            participant_token: AppState.currentToken,
            participant_id: AppState.assignment.participantId,
            task_index: taskIndex,
            paper_id: task.paperId,
            paradigm: task.paradigm,
            event_type: 'submit_post_task_questionnaire',
            payload: responses,
            timestamp
        });

        AppState.currentState = await backend.getCurrentState(AppState.currentToken);

        // Check if all tasks are completed
        const allDone = [1, 2, 3].every(idx => 
            backend.getTaskStatus(AppState.currentState, idx) === 'QUESTIONNAIRE_DONE'
        );

        if (allDone) {
            navigateTo('/complete');
        } else {
            // Move to next task
            AppState.currentTaskIndex = findNextTask(AppState.currentState);
            navigateTo('/overview');
        }
    } catch (error) {
        console.error('Questionnaire submission failed:', error);
        alert('Submission failed. Please try again.');
    }
}

/**
 * Render complete page
 */
function renderComplete() {
    // Complete page is rendered via HTML, no additional action needed
}

/**
 * HTML escape utility function
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Expose handler functions to global scope (for inline event handlers)
window.handleAcceptRound = handleAcceptRound;
window.handleRejectRound = handleRejectRound;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    handleRoute(); // Initial route handling
});
