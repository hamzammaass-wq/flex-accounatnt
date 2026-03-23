# Required Checks

Repository branch protection cannot be enforced from source files alone.

Configure the protected main branch to require these GitHub checks:

- Deploy to Firebase Hosting on PR / quality_checks
- Deploy to Firebase Hosting on PR / build_app
- Deploy to Firebase Hosting on PR / e2e_smoke
- Deploy to Firebase Hosting on PR / e2e_critical
- Dependency Review / dependency_review
- CodeQL / analyze

Optional but recommended:

- Deploy to Firebase Hosting on PR / build_and_preview

If a workflow or job name changes later, update branch protection to match the new check names.