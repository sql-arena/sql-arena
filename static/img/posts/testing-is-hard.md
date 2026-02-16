---
title: "Testing is Hard  and we often use the wrong Incentives"
date: "2024-06-30"
tags: 
  - "performance"
  - "qa"
  - "testing"
---

I have been spending a lot of time thinking about testing and reviewing testing lately. At a superficial level - testing looks simple: Write test matrix, code tests, run tests, learn from results, refine. But we often overlook the nuances.

Today, I take a break from my usual talk about databases to share my thoughts on test incentives, CI/CD, unit testing and system level engineering.

# QA Organisations - and Incentives

Here is an unpopular opinion: Our industry treats QA engineers as second class citizens. I have seen this throughout my now 35 year long career as a developer. Developers and their managers may ask: "Who in their right mind would spend their career in IT writing and running tests for other people?" - and from there it follows that anyone on that path must be barking mad. I think this view (widespread in large organisations) is a big contributor to the kind of quality problems that plague our industry.

Organisations often align incentives with: "getting stuff done" - which in corpspeak means: Write prototype code that does things - no matter how imperfect - then ship it to see what sticks and adjust course based on feedback! There is an almost religious attachment to this idea of "customer driven design".The Facebook motto of: "Move fast and break things" crystallises this idea into its predictable consequence. How did our industry convince ourselves that customer requirements are _so_ unknowable that we can say _nothing_ about how to engineer software without asking customers what they think first? Agile only amplified this idea and we now hear it chanted all over the Internet.

How would you like the people designing your new BMW to think this way? Would you be comfortable getting into a plane if it was designed by an organisation motivated by an ideology like this?

## CI/CD - Find bugs Early

We often view testing as a way to survive the "Agile" way of creating software - while still producing quality products. Our code may not be perfect , because it has to be infinitely malleable for those unknowable, fickle customers. But at least we can add tests to prove that it all works after all! We can practice "test driven development" and integrate testing into our CI/CD pipelines to spot defects early.

It is certainly true that a bug found is the field is at least 10x more expensive to fix than one found before we ship. The longer a bug is around, the harder it is to fix. CI/CD forces us to think about automation early in the design process - which is a very healthy way to preserve our sanity. If you find yourself doing the same thing manually, twice, you need to get lazy and automate instead! Because of this, I _do_ think CI/CD is a necessary requirement when building robust software at speed. It is a good thing we should all practice.

But I think it is a dangerous fiction to think that CI/CD and test driven development on their own will help us build higher quality software...

# What are we looking for when we Test?

Coming back to incentives - what do we reward in test writing QA engineers and Developers?

- Lines of code
- Number of tests written
- How automated the test is
- How quickly they can cover the test matrix with tests
- Code coverage
- Some kind of code quality measure

I think we have to distinguish between "test that validate code works" and "tests that actively try to break code". If we just want to convince ourselves that software works reasonably well, we can quickly create test code which proves certain code paths do as expected. If our incentives align with covering the test matrix - or even having full code coverage - that is the kind of tests we will get.

I don't think the above incentives are very good. Having full code coverage and all test matrices filled with test code _feels_ good. There is a certain kind of OCD level, dopamine reward coming from it. The kind of dopamine you get from completing your stamp collection or unlocking all the rewards in a computer game. My autistic mind can relate! But it is a false confidence - a mental trap we are all prone to fall into.

We tend to write test to validate what we _think_ the software should do, going over every point in our spec. We are often blind to things we never thought could happen in the wild. They were not in the spec, so why test for it?

Imagine building a fast car like this:

- 4 wheels - thread pattern good - check!
- 1 Engine - seems to run OK, no bad noises - check!
- Steering wheel seems to move the front wheels left and right - check!
- Ship it!

We take a car to the racetrack before we put it in the market! We smash it into things with crash test dummies inside, just to see how it holds up under accidents. We run the engine at full revs for weeks and carefully measure vibrations to see what impact it might have on the car. What we find during these tests, is fed back into the design process and may fundamentally change the components and overall design of the finished product. We often build entire prototype cars that we know are unstable and needs engineers to keep running, just to validate a hypothesis. We then throw those prototypes away when they have outlived their usefulness - but we keep the test setup.

Developers are somehow afraid to expose their code to system level pressure before their precious unit tests are written. Like cars, code has no emotions - we need to stop treating it as if it did. We need to actively hurt our code at the system level. That means coming to peace with the idea that sometimes, you need to build a prototype system, not just a prototype component. This prototype system is not wasted, because the tests we write against it will be reused for the final system.

## A better QA incentive?

I propose that there are better incentives available to us, namely:

- Unique bugs found
- Clear proof of unexpected scale, resource and performance curve shapes

Incentivising people in this way takes us down a very different path when hiring for QA organisations. It also changes the way we view developer contributions. Our QA engineers now become "breakers". They are no longer just reading the spec and validating against it - doing menial tasks that ChatGPT will one day perform. They are actively writing code that is, if they are clever, adaptively hunting for bugs.

I want my QA engineers to be:

- In active, constructive opposition to the developers
- Not be a secretary writing tests for developers who can't be bothered
- Inspired by the "[IBM black team](https://www.themarysue.com/ibm-black-team/#:~:text=Grouped%20together%20by%20IBM%20higher-ups%20from%20a%20general,they%20were%20the%20fear%20of%20other%20IBM%20employees.)"
- A professional race driver testing the very limits of the car on the race track.

## Scale curves

Once you become a breaker - you will start thinking about scale curves. It is a mindset. You will start asking questions like these:

- What happens if I increase the number of concurrent users to 10.000?
- I wonder what the behaviour of the system is, if all values in this foreign key of my data model is the same? What does the CPU profile look like under these conditions?
- How much CPU or DRAM does this system consume and is that proportional to the number of requests/sec coming in?
- If I double the input of data, how much slower is my `ORDER BY` in my SQL statement?
- Will this code still work if I cut the memory on the machine in half? How low can I go before things break? And how do they break?

Performance measurements should have have **O(n)** or or **O(n lg(n) )** scale curves. We expect systems to degrade gracefully under stress. If we find that a component does not follow these curves and this behaviour - we can often assert with some confidence that the code inside that component is poor, buggy or both. Armed with our graphs, we go to the developers owning the code and we have them improve it.

High performance code (in terms of O-complexity) is good code - because high performance code requires you to think harder about the data structures you use, and use them more carefully. Observing how your code performs under stressful, resource constrained conditions is more likely to flush out memory leaks (yes, those also occur in GC languages), race conditions, bad error handling and poor programming practices.

Put differently: "Make it right, then make it fast" - is the calling card of a junior programmer. Fast (with good data structures) should be your default and the first thing you validate.

Being a "breaker" is every bit as hard as being a developer. Measuring what code does from the outside - at an instrumented level - is a form of science. If you can provide validated, accurate graphs of scalability curves - you are _not_ a second class citizen and you should be paid handsomely for your efforts.

And you will strike fear into the hearts of senior developers - which is always a good thing. It keeps us humble.

# Developer Organisations - and Incentives

I write this well aware that distinguishing between developer and QA organisations is becoming harder. Particularly if you practice DevOps. But I think we can distinguish between two, broad categories of testing:

- **White Box Testing** \- Where you you try to break your own code before it even gets into the repo
- **Black Box Testing** \- Where you, or someone in your org, tries to break your code by applying tortuous workloads to it before the code ships

To get the discussion started, I think we need to look at a concrete example.

## White Box Testing - and Unit Testing

Once again we use Python, because everyone can read it.

I am going to use `psycopg` for our example, because Postgres is the lowest, common denominator of databases. Python database connectivity and drivers is governed by the [PEP 249](https://peps.python.org/pep-0249/) standard.

If you want your code to be DRY and talk to Postgres via Python, then it wont be long until you write something like this (Because you are not the kind of idiot that uses an ORM right?):

```python
def execute_sql(statement: str, conn_params):
   try:
        with psycopg.connect(**conn_params) as conn:
            with conn.cursor() as cursor:
                cursor.execute(statement)
                conn.commit()
    except (psycopg.DatabaseError) as error:
        raise DatabaseError("This is the exception that should have been raised, which is driver independent")
```

Being the good, Agile programmer you are, how would you unit test this? That depends on what I (and you) mean by unit test doesn't it?

If you are a unit test purist, you might argue like this: "Unit tests should be independent of anything outside the class/function under test - so we need to mock the `psycopg` object". You then go ahead and use your favourite mocking library to create a mocked set of `psycopg` classes.

Notice that thinking along these lines actually reveals something interesting about this function - an insight we often get when applying the mindset of a unit tester. To mock things, we want dependency injection in our code structures. You could argue that our design should be informed by the test strategy. You would say (and I would agree) that the function really should have this signature:

```python
def execute_sql(statement: str, open_connection: Any):
   assert open_connection.is_open # Just kidding! PEP 249 has nothing to say about this
   
   with open_connection.cursor() as cursor:   
       cursor.execute(statement)
       conn.commit()
```

This function will work with JDBC drivers (via `JayDeBeAPI` for example) and other driver infrastructure too. It would even work if you were talking to a _different_ database than Postgres. We can now mock a general connection and cursor object to comply with PEP 249.

<aside>
<b>Why PEP 249 is a bad joke</b>

The PEP 249 "standard" must have been written by people who hate databases and the developers who use them.

If you look at the above function you might be, rightfully, wondering how the hell one can do exception handling in this method? There is no superclass that all database drivers inherit from (wouldn't _that_ be nice?). It is also not clear what the type of `open_connection` is here - but you already got used to this ambiguity in Python after you lost your will to live (hint: You can use `Protocol` - which all other programming languages called an "Interface" - to restore some semblance of sanity).

Why on earth would we not want some way to ask if someone has called `close()` on a connection? You could catch the exception raised if you try to use the connection that is closed on purpose - that would be a very Pythonic (read: uninformed) way to do things. Of course, this _would_ require you to know, at the call site, which implementation of `Error` you are dealing with - which the standard is not clear about (only that it must inherit from `Exception` - and that does not tell us much)

What do you think the return value of `cursor.execute()` is? I have no idea... neither does PEP 249! It [simply states](https://peps.python.org/pep-0249/#cursor-methods): "Return values are not defined.". Return values are _not_ defined for one of the most important functions in the standard? What are you smoking? Wouldn't it have been nice to have some well defined return value? For example, the number of row affected (if any) by the execute? Or if you really don't know and can't think of something reasonable, just say: "It returns `None`"

What's the deal with the `cursor` class? Why do we need a cursor to execute a statement? Why does the connection itself not have an execute if I want to run statements that don't require a cursor to loop over the data?

Some databases can return multiple result sets from a single roundtrip. Apparently, that is what [`nextset`](https://peps.python.org/pep-0249/#nextset) is supposed to handle. Has anyone heard about iterators? They are kind of a big deal in Python last time I checked...

Why do you bother writing a standard that is so incomplete and so far from how databases actually work? Now we are stuck with it...
</aside>

## Unit test Purity - Considered Harmful

You have carefully mocked a connection object (and its corresponding cursor with a context manager) and you can now write a Pytest like this:

```python
def test_execute_sql(mock_connection):
    execute_sql("SELECT * FROM foo", mock_connection) 
```

What are you going to assert? Maybe your `mock_connection` keeps an internal buffer of all the SQL statements it has "mock executed"? If it does, you can `assert`:

```python
def test_execute_sql(mock_connection):
    execute_sql("SELECT * FROM foo", mock_connection) 
    assert mock_connection.last_executed_sql == "SELECT * FROM foo"

# DRY version:
def test_execute_sql(mock_connection):
    statement = "SELECT * FROM foo"
    execute_sql(statement, mock_connection) 
    assert mock_connection.last_executed_sql == statement
```

Congratulations, you have just proven that you know how to mock things that copy strings! You have also created more code that tests your three line function than the code in the function. And most importantly: you still have _not_ proven that the code can actually execute statements against a database and handle the exceptions that may come your way.

This is an extreme example. Unit test purists may even say that this is a straw man. I would respond that your defense is a "[No True Scotsman](https://en.wikipedia.org/wiki/No_true_Scotsman)" fallacy. I have seen this case almost verbatim as above - and many like it - in the wild!

### A unit test is _not_ proof that your code works

What is the problem with this way of "proving that your code works" ?

- It makes it less likely that you will change interfaces that are hard to use and maintain by other programmers
    - Because it requires so much changing of code around that interface.
    - And you are now invested in the code you have just written
- You end up with more test code, than code which _does_ things
    - At best, it is a waste of time, at worst: it creates a maintenance nightmare.
- You often end up with a false confidence that your code works
    - The things that matter, but which only happen in the wild, are not properly tested.
    - For example: Handling a broken connection, network packet loss or a sudden disconnect from the database
- You often lose the ability to iterate fast and try out various, better code structures -
    - Because your precious flow state is broken by the incessant need to write unit tests to prove your assertions.
    - This erodes your ability to think of systems "as a whole" and instead switch to thinking only at the component level.

Many of these issues can, in principle, be eliminated by deferring the writing of unit tests until your interfaces are stable. But you are now pushing testing to the very end of the project - where it is more likely to get axed by your SCRUM master who is eager to allocate you to the next JIRA ticket. Agile is a cancer that way!

## Black Box - "Breaker" testing

Let us switch our minds into the breaker mindset: Instead of validating the function itself, let us validate the wild environment it will live in, before we send it into the jungle that is customer land. Instead of all this mocking, why don't we use an _actual_ database and just execute the function against it?

What kind of tests could we imagine writing now:

- Kill the database connection after the cursor is created (wonder what exception happens if we do?)
- Use a connection pool that did not clean up a connection state (maybe it has an open transaction already?) before passing an open one to the function
- Have the commit time out (inject latency into the database itself - that might inform our interface)
- Pass JDBC and ODBC drivers to the function and see what that does
- Throw a warning back on the connection from the database
- Measure the number of concurrent execution we can have of this function and see what happens as we increase it (does the database keep responding?)
- Try to throw some of these odd exception at the callers of this function and see how they respond
- Validate that an `INSERT` statement actually gets written to the database when the function is called (by running a `SELECT` after it). That way, we could even validate (and realise we need to write) a function that returns results from the database.

More ideas will occur to you I trust. This gives you a flavour of what kind of thinking we can apply.

Now, I ask you: If we do the above, _any_ of the above - what is the point of unit testing this function? Are there any bugs the unit test would have found that we would have missed with our breaker test? Would the unit test failure have informed the system design choices?

This validation, when properly instrumented, will not only validate that the function actually works - it will validate that interactions with the function are sane and architecturally sound at the system level.

This is different way to think about black box testing. Because testing in this way requires you to read the code first (or have a developer explain it), reason about it, then try to break it from the outside. You may even create little error injection points in the code - to find those tricky race conditions.

You are treating the system as a black box during test execution - but you are allow to "peek" into the system to find juicy targets for testing.

## Why Testing is an Architectural Responsibility - not just a QA function

Because many developers are wedded to unit testing (and sometimes, functional or component testing) - they draw boundaries around their code: "I know my component works, because I have unit/functional tests that prove it does. And my CI/CD pipeline runs these tests whenever someone makes changes". Organisations often reward this behaviour because it compartmentalises problems.

The problem with this idea is that you can have passing, well written tests, validating stupid code that someone will eventually have to read and modify. Your testing will also be limited to the kind of interactions you can imagine coming from the world immediately surrounding your component. No amount of component testing will guarantee that the code entering the repo is easy to maintain, easy to reason about and behaves responsibly when put together with other components into a full system. In software engineering, we keep telling ourselves that as long as each component works in isolation - the system made of these components will make sense. It's a lie, and we all know it - if we are honest with ourselves... This is also how you end up in microservice madness!

Of _course_ we need to test components, even our classes and functions (when they are complex) - but we should be careful not to duplicate effort if the system level testing is already validating the very same code. Test is code too - and code has a long term costs associated with it - simply by existing.

### Breakers and Architects working together

A "Breaker" mentality, applied at the system level, can test for issues in the system as a whole. With proper instrumentation, which we must drive into the developer organisation, we can even attribute blame (in the git sense of it) to specific components. But all this won't prevent the system itself from being built to be unmaintainable in the first place. For that, we need standards, we need some kind of review (to catch the inevitable, poor quality code), we need to build a culture of quality that is not just "write more tests and things will get better". Most of all, we need to validate that the system is actually made of the _right_ components - not just bug free ones.

It is possible to end up in a situation where we are in endless bug hell - and where component owners still claim that their code works perfectly as per spec and latest CI/CD test runs.

Knowing how the components will eventually play together is a crucial, architectural task. And it can only be successfully executed when component owners talk to each other - with a whiteboard in front of them. I am _not_ saying that there isn't a level of complexity where divide and conquer is the _only_ way to reason about the system. What I am saying is that this complexity level is _much_ higher and _rarer_ than we are typically led to believe. I think we tend to design systems that are more complex than they need to be, because of this belief in dividing things up. The "divide and conquer" level of complexity is something that only applies to very large organisations, where communication between developers isn't effective and the code base is very, very large. Try talking to each other instead!

It is the job of the architect to constantly chip away at complexity, not to add to it by splitting things into smaller and smaller components. We need to get better at reasoning about whole systems - and hold our architects to that standard. Architects must make predictions (that must be validated by the breakers) about how that system will behave once the components are put together. And if our predictions don't come true - we may need an entire different set of components. This means we must _validate_ at the system level before we build a finished component.

An old quote comes to mind from one of the best books on software ever written:

> "Build one to throw away".
> 
> Frederick Brooks, "The Mythical Man Month"

We can spend our precious engineering time building unit tests which validate things we _know_ will be tested later. If we do, we are unlikely to throw away entire components and build a better system. Because, when the time comes to do that, we will have run down the clock. In a deployed system at scale, we can refactor much more safely with unit tests. We may in fact need to build unit tests post-hoc simply to make sure we stay stable while the code is shaking. But while building the system, we should validate the system level before we burn our brain cycles writing too many unit tests. Once we know the system level design is sound, we can add tests (remember to plan for that).

# Summary

Today, I took a slightly different approach to my normal ranting. If you are still with me this far - thank you for listening.

I shared my thoughts on how "Breakers" can often find bugs that we couldn't even think about when writing unit/component tests. This is a top down, science inspired way to look at testing: we form hypothesis about the system itself and spend resources to validate these hypothesis and influence the design of components based on what we learn.

I claim that QA incentives are often misaligned and are not actually making software better. This happens because QA is viewed as a "addon" to the component building and a local application of force - not a way to influence the system as a whole.

My stance is that you cannot test your way to quality. There is an aspect to software engineering which requires us to build a culture of good coding to achieve high quality - testing won't be enough (but is, of course, required).

I also questioned the wisdom of applying a completely customer driven design paradigms to drive architectural decisions. If Apple has listened to customers instead of Steve before building the iPhone - we would all be carrying a Nokia 3310 with a multi-coloured snake game in our pockets (this sentence won't age well).

Now, go read my database series.

- [Database Are Just Loops - Joining](databases-are-just-loops-joins.md)