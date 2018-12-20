# Contributing to node-openam-agent

Thank you for taking the time to contribute to this project! Here's some guidelines; I would greatly appreciate if you followed them.

On GitHub:

* Please find or file an issue describing what's missing, broken or needs improvement
* Fork the repo and reference the issue ID in your commits
* Create a PR and explain what you've changed

In your code:

* Please use the TSLint rules as a style guide and quality check. You can run `npm run lint` to get the suggestions
* Annotate your classes and methods with JSDoc as appropriate
* Be economical with inline comments and prefer refactoring your code into smaller methods
* Make sure the code compiles (run `npm run build` to test)
* Write some unit tests for your changes 
  * Test files should be next to the tested file, with the same name and a `.spec.ts` extension
* Make sure all tests pass
  * tslint and jest are run in TravisCI on git push
* Make sure the code runs on all supported Node.js versions
  * TravisCI runs the tests on various Node.js versions (>=6)

Thanks!<br>*-Zoli*
