# Snap2Health: Meal Detail Page Enhancement Roadmap

## Current Status

The `/meals/[id]/page.tsx` route has been enhanced with:

- Low-confidence analysis UI indicators
- Fallback awareness display
- Ingredient confidence visualization
- Reasoning/debug transparency
- Session-based meal recovery

## Testing Focus Areas

1. **Standard Analysis Display**
   - Goal score rendering with appropriate color
   - Nutritional information display
   - Positive/negative factor sections

2. **Low Confidence Analysis**
   - Yellow warning banner appearance
   - Tooltips explaining limitations
   - Expansible details section
   - Appropriate confidence indicators

3. **Fallback Analysis**
   - Red fallback banner
   - Partial results display
   - Clear explanation of limitations
   - Image improvement suggestions

4. **Session Meal Handling**
   - Blue session banner
   - Clear explanation of unsaved status

## Next Sprint: Component Extraction

Extract these inline components to standalone files for better maintainability and reuse:

1. `src/components/meal-detail/GoalScoreDisplay.tsx`
   - Display goal score with confidence indicators
   - Show tooltips for confidence context
   - Visual progress bar with color coding

2. `src/components/meal-detail/IngredientsWithConfidence.tsx`
   - Show ingredients with confidence scores
   - Display confidence indicators (🟢🟡🔴)
   - Category tagging

3. `src/components/meal-detail/AnalysisConfidenceWarning.tsx`
   - Warning banners for low-confidence/fallback
   - Expandable tips section
   - Missing data indicators

4. `src/components/meal-detail/ReasoningLogs.tsx`
   - Collapsible debugging logs
   - Step-by-step reasoning trail
   - Technical details for power users

5. `src/components/meal-detail/SuggestionsAndFeedback.tsx`
   - Display personalized suggestions
   - Show nutritional feedback
   - Clean formatting for readability

6. `src/components/meal-detail/NoAnalysisData.tsx`
   - Friendly empty state display
   - Recovery suggestions
   - Visual indicators

7. `src/components/meal-detail/SessionMealBanner.tsx`
   - Session storage notification
   - Save to account functionality

## Functional Enhancements

1. **Save Session Meal**
   - Add functionality to save session-based meals to the user's account
   - Implement with Firestore transaction
   - Add success/error feedback

2. **User Feedback Collection**
   - Add "Was this analysis helpful?" component
   - Collect yes/no and optional comment
   - Store in Firestore for ML training
   - Track which analyses lead to corrections

3. **Confidence Score Explainer**
   - Add a new "How we analyze meals" modal
   - Explain confidence scoring system
   - Show examples of high/medium/low confidence analyses
   - Provide tips for better photos

## Testing Strategy

1. Create test fixtures for:
   - High-confidence complete analysis
   - Medium-confidence partial analysis
   - Low-confidence fallback analysis
   - Empty/error analysis

2. Implement Jest unit tests for each component
   - Test various confidence levels
   - Test null/undefined inputs
   - Test visual state changes

3. Create Cypress E2E tests for full page interactions

## Deployment Strategy

1. Extract components one by one to minimize regression risk
2. Deploy components individually with thorough testing
3. Once all components are extracted, refactor the meal detail page
4. Final testing with all components in production

## Future AI Prompt Ideas

```
Refactor `/meals/[id]/page.tsx` to extract UI components into their own files inside `components/meal-detail/`. Add JSDoc to each, and implement Jest unit tests for confidence display and fallback messaging.
```

```
Design a user feedback collection system for meal analyses. Create components for rating analysis accuracy and collecting improvement suggestions. Store the feedback in Firestore and use it to train a model for better analysis.
```

```
Create a visual explainer component for confidence scoring. The component should educate users about how the AI analyzes meals, what factors impact confidence, and how to take better food photos for more accurate analysis.
``` 