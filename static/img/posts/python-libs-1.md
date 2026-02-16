---
title: "Making Decent Python Libraries - Part 1"
date: "2024-12-16"
tags:
  - "python"
  - "architecture"
---

Python has now infected computer science departments and data analysts across the planet. The resulting ecosystem is
a mess of libraries - that are often poorly designed out outright harmful.

Recently, I have had to write a few libraries of my own and this has taught me a lot about what makes a good Python
library. In this series of blog entries, I will share this knowledge and tell you about the lessons I learned so
you don't have to suffer through them.

# What is a Python library?

A python library is a self contained piece of code that can either be imported via a prebuilt package or by
simply copying the library into your repo.

Why would you ever want to just copy the library? A few reasons:

## Package managers are consistently horrible in Python

There is no good package manager in Python. You might expect a package manager to deliver you a specific version of
a library that is known to work. Good luck with that! I have used both `pip` and  `poetry` to manage my
dependencies - none of them deliver libraries that are known to work or even build across OSX, Windows and Linux.
You are basically in [DLL hell](https://en.wikipedia.org/wiki/DLL_hell) all the time.

Since there is no single, agreed upon package manager in Python, you shouldn't force your consumer to use a specific
one.

## Versioning a library with the code consuming it is often preferable to a Package Manager

When you build and run software, if the source code of a library you need is available to you - it is often preferable
to
put sources you depend on in a single repo (via a simple file copy or linking). This gives you the following benefits:

1) You can fix problems in the library yourself and not have to wait for the maintainer to take your Pull Request
2) The library is always available, even if it is no longer available in a package manager
3) You can run the entire application without having to rely on any package manager infrastructure being available.

Ad 1) This turns out to be particularly important in the Python ecosystem because most libraries are really poor.

Ad 2,3) See the section on Package Managers above. 3 is extra important on dark sites (that's places without internet
access for those who never experienced one). On such sites, you often want to distribute all code needed tol run as a single ZIP file
that can be reviewed and validated by the receiver and does not depend on any external infrastructure.

# The magic `__init__.py` file

In Python, a library (or "package") is a directory which contains a `__init__.py` file. This file makes it possible for `import` statements to find your
code. For example:

```python
from mylib.mysublib import Foo
```

...Says to Python:

In your `PYTHONPATH` (and in the place you are current running) look for a directory called `mylib`. If that
directory contains a file called `__init__.py`, then look for either another directory called `mysublib` that has an
`__init__.py` file or a file called `mysublib.py`. In that file, or in that sub library, look for something 
called `Foo` - then import `Foo` from there.

This is an example of "convention over configuration" thinking - a design pattern I approve of. Note the duality
of the `mysublib`: it can be either a file or a sub-library.

You use `__init__.py` to tell the world about the interface to your library. It is the thing which is stable, even
if you change the internal implementation of the library.

Consider a library called `mylib` with a class call `Bar`. The directory structure would look like this:

```
mylib
  - __init__.py
  - bar.py
```

With:

```
file: bar.py

class Bar:
    def __init__(self):
        pass

    def serve(self) -> str:
        return "Beer"


def dilute(alcohol_pct: float) -> float:
    return alcohol_pct * 0.5

```

Because `__init__.py` makes `mylib` visible, the user _could_ import `Bar` like this:

```from mylib.bar import Bar```

But that defeats the point of  `__init__.py`. For example, we might have something inside `bar.py` that is none of
the users business (ex: `dilute`). We need a way to say: "This directory is called `mylib` and you should only see
some of the things inside it"

## Exposing your interface in `__init__.py`

The point of making libraries is that they are abstractions, which hide complexity. We want to clearly distinguish what 
is visible and part of the abstraction and what is not. For the C-programmers out there: we want something that
is the equivalent of a header file.

To expose a class or function from a library to a consumer of that library, you do this:

```python
file: mylib/__init__.py

from .bar import Bar

__all__ = ["Bar",]

```

The `__all__` variable is a Python convention that tells Python that `Bar` can be imported directly from `mylib` like
this:

```python
from mylib import Bar
```

It also tells Python what will happen if you do this:

```python
from mylib import *
```

The above is generally considered bad practise in Python, for the same _bad_ reasons that wildcard imports are considered
bad practise in Java (i.e. it's perfectly fine - but PyLint will complain because it has stupid defaults).

A few other things to note:

### `__all__` lists must quote the exposed names

We have:

```python
__all__ = ["Bar",]
```

Why is `"Bar"` quoted? The quoting says to Python: There is something called "Bar" in this module - and I am reserving
that name for it. It is a bit like doing a forward declaration in a C-header. In the case of C, this was historically
done to reduce compile times and make handling of circular dependencies easier. Of course, a modern programming language
does not need to care about any of that. In Python, the need to quote a name in `__all__` is just a plain old
design mistake.

### `__all__` is a list, with a trailing comma

You typically add a trailing comma to the list in `__all__` because it makes it easier to add more names to the list in
the future.

When you auto format a file (via direct linting or indirectly via an IDE), a trailing comma makes the linter lay out
the list nicely.

For example, let us say you had to add `Baz` to the list of exposed names. You would do this:

```python
__all__ = ["Bar", "Baz",]
```

The linter would typically render something like this

```python
__all__ = [
  "Bar", 
  "Baz", ]
```

<aside>
<b>Trailing commas in lists</b>

I happen to love the trailing comma in Python lists. It makes it a lot less likely that you will make a mistake when
adding an item to the list.
</aside>


### The `import` uses a local reference

This line:

```python
from .bar import Bar
```

... Tells Python what `Bar` actually is. It is super, not-DRY and disgusting. 
Every other, modern language has the notion of public and private visibility. Python does not. 

Instead, we tell Python that `Bar` is part of the library by combining:

- There is something called `Bar` in this library (via the `__all__` list)
- The implementation of `Bar` is found in `bar.py`

Why do we use a local reference? Some Python programmers would tell you to use a reference that is 
relative to the root of the repo you are in... or relative to some other root that is assumed to exist. 
This is nonsense! We want the ability to `git mv` our library to a different location in the repo and
not have to worry about changing every `import` in `__init__.py`.

### `__init__.py` is executed on import!
Just when you thought: Surely, this language can't possibly be more insane...

Let's modify `bar.py` to be:

```python
file: bar.py

class Bar:
    def __init__(self):
        pass
        
    def serve(self) -> str:
        return "Beer"


def dilute(alcohol_pct: float) -> float:
    return alcohol_pct * 0.5


raise ValueError("Bar's closed, go home")
```

Write a little test for the library:

```python
import pytest

from mylib import Bar

def test_go_drinking():
    the_bar = Bar()
    assert the_bar.serve()
```

Don't run this code yet. What do you think is going to happen?

If you guessed: The test will fail with a `ValueError`, you are correct. If you think that makes
any sense in a language which also require you to forward declare objects (remember the double quotes?), 
I don't know what to tell you!

The `__init__.py` file is _executed_ when you import the library. This means that any code that `__init__.py`
imports is also executed. We just went through this nice dance of declaring names and their 
implementations separately - for no good reason. Remember, there is no linking in Python, its just script code.

Of course, implementing  generally executed code in files like this is generally a bad idea. Encapsulation my friend! 
Though, you might have little shell scripts inside the library for test purposes - make sure those files don't contain 
classes you want to expose to the outside world.

# One file per class
In Python, a single `.py` file can contain as many class definition as you like. However, it is generally a bad idea
to have multiple classes in one file - at least if those classes are publicly visible in your library.

Why is this?

- If class == file - then `git log -- [file name]` makes it super easy to spot historical changes to a class
- While you may object to have tiny classes in their own files - classes often don't stay tiny. If you later 
  feel the need to split the file into multiple files, you will have to change the imports in your `__init__.py`
  - The resulting repo diff will then be harder to understand
- Navigating to a file named the same as the class is very easy for the "historically challenged". I.e. those 
  who do not use an IDE or who rely on navigating the file system to find things in a project. (yes, these people exist)

## Files containing private classes should be prefixed with `_`
Python has a convention that says: "if something starts with an underscore, it is private". it provides an important 
hint to the consumer of the library. For example, our library might have a class called `Moonshine` that is internal 
to the library. We would hide it like this:

```
mylib
- __init__.py
- bar.py
- _moonshine.py
```

It is implied that the consumer of the library should not import `_moonshine.py` directly. 

If you are coming from another language, you might expect "privateness" to be fully enforced by the language. That
will allow you to reason with confidence about what code can and cannot be executed by outside consumers. 

Not the case in Python - the excuse being: "We're all adults here" (but apparently adults who don't understand the notion
of friendship)

# A file inside the library should _never_ import the library itself
There is enough material in this section for another blog entry, but I want to get you thinking about this.

I want to extend `mylib` with a `Bartender` class. 

First, we make sure a `Bar` knows who can works there:

```python 

file: bar.py

from mylib import Bartender
class Bar:
    def __init__(self):
        self.bartenders: list[Bartender] = []

    def serve(self) -> str:
        return "Beer"

```

(because we are not animals, we also add a type hint to the `self.bartenders` list)

We then implement the bartenders themselves:

```python
file: bartender.py

from mylib import Bar
class Bartender:

    def __init__(self, works_at: Bar):
        self.works_at = works_at

```

Our `__init__.py` looks like this:

```python
from .bar import Bar
from .bartender import Bartender

__all__ = ["Bar",
           "Bartender",]
```

For anyone who has used _any_ other language supporting object-oriented design, this should be pretty straightforward
and non-controversial (Java programmers: please don't say dependency injection).

We write a simple test:

```python

from mylib import Bar, Bartender
def test_bartend():
    the_bar = Bar()
    tom_cruise = Bartender(the_bar)
```

Without running this, what do you _think_ will happen? Grab a bucket, because you are about to be sick...

This is what happens:

```
ImportError: cannot import name 'Bartender' from partially initialized module 'mylib' 
(most likely due to a circular import)
```

Why? 

Remember that `__init__.py` (and anything else you import) is actually executed? When `test_bartend()` runs, it:

1) imports `Bar` and `Bartender` from `mylib`
2) This has the effect of executing `mylib/__init__.py`
3) This then executes `bar.py` (because `from .bar import Bar` is in `__init__.py`) 
4) `bar.py` does this: `from mylib import Bartender`
5) But `bartender.py` needs to `from Bar from mylib` (because a bartender knows where he works)
6) That then tries to import `Bar` from `mylib` - but `Bar` is in the process of initialising - and we blow up

A C-programmer might wish for `#pragma once` or `#ifndef` to solve this problem. But Python is not C - it just has the 
annoyances you experience in C, and none of the good solutions that C invented.

Some Python programmers will then tell you that you shouldn't design object hierarchies like these. They are full of 
shit - and I will show you how you can still do smart things in Python in the next blog entry.

# Summary
As I previously stated, there is only so much Python I can bear in one day before I feel an urge to self harm.

Today, we learned about the basics of `__init__.py` files and established some rules for making them:

Always:
- Use `__all__` to expose the interface of your library
- Quote the names in `__all__`
- Use a trailing comma in `__all__` lists
- Use relative imports in `__init__.py`
- Hide classes that are not part of the public interface in files prefixed with `_`

Never:
- Have any directly executable code in the files you import from `__init__.py`
- Expose a class that does not have a corresponding file in the library
- Import the library from inside the library itself (more about this later)

In the next part of this series, we will look at how you internally structure files inside the library, particularly
how to avoid circular imports while still being able to build proper object graphs.

