# Pluribus poker bot

I'm trying to implement the pluribus poker bot from this [paper](https://science.sciencemag.org/content/365/6456/885) and the [supplementary materials](https://science.sciencemag.org/content/suppl/2019/07/10/science.aay2400.DC1). The latter provides pseudo code, which I have tried to replicate in a node js environment.

Currently, the hands aren't played correctly; sometimes the round increases when it shouldn't be the case. Some other times, the bot gets in a loop.

There are grand challenges to implement this correctly. The biggest one I'm afraid, is that you can't use NodeJS with multiple cores with a shared memory. At least, I don't think that's possible.
