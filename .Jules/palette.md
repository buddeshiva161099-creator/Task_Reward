## 2025-05-15 - [React State Management in Search Modals]
**Learning:** In Next.js/React applications with strict linting (e.g., `react-hooks/set-state-in-effect`), it's better to reset modal state (query, results) in the event handlers that trigger the modal (click, keyboard shortcuts) rather than in a `useEffect` watching the `isOpen` state. This avoids unnecessary re-renders and potential "set state in effect" linting errors.
**Action:** Always prefer clearing input/result state in the `onOpen` or `onClose` event handlers for modal components.

## 2025-05-15 - [Keyboard Navigation with Flat Lists]
**Learning:** When implementing keyboard navigation across categorized search results (e.g., Employees, Companies, Tasks), mapping them into a memoized "flat" array with explicit type markers makes the index-based navigation logic significantly simpler and more robust.
**Action:** Use `useMemo` to create a flattened version of categorized data for simplified keyboard selection logic.
