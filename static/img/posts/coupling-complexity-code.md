---
title: "Coupling, Complexity, and Coding"
date: "2025-02-23"
tags:
  - "architecture"
  - "sql"
---

Why is the IT industry obsessed with decoupling?

Does breaking systems into smaller parts you can understand individually really make them easier to manage and scale? 

Today, we explore the pitfalls of this obsession and draw lessons from nature and other 
fields of engineering. As always, this will be a controversial take - if it wasn't, why would
you bother reading this instead of some LLM generated nonsense on LinkedIn?

# Our IT Industry’s Obsession with Decoupling

With the exception of a few master programmers out there, our industry operates on a fundamental assumption: 
"decoupling is always good". Whether it’s microservices, 
unit testing, ORMs or security models, the prevailing belief is that breaking things into smaller,
independent parts will make systems easier to build, manage and scale. This assumption permeates everything from software
architecture to project management methodologies like Agile.

The siren's song goes something like this: 

- If you make each piece of code small enough, you can reason about it
- If you can reason about all components, you can reason about the system
- Hierarchies of dependencies are good, mutual dependencies and networks of dependencies are bad (the Python module system is a good example of where this thinking takes you)


## Decoupling doesn't Stop Emergent Behavior

Real-world systems, whether in IT, nature, or human governance, exhibit **emergent behavior**: Patterns and outcomes arising
from interactions between components that are hard to predict by looking at each component in isolation. This 
seems to be a fundamental property of systems that have non trivial complexity (i.e. all systems worth making).

The allure of decoupling is that this emergent complexity can be reduced, by reducing dependencies between components. 
However, this isn't really how things play out in real life.

Consider:

- **Microservices** create independent services, but failures cascade unpredictably through API calls, retries, and
  distributed state. This leads to distributed, debugging nightmares. 
- **The Internet** is built on independent nodes with well defined protocols.. Yet global behaviors (e.g., social media virality, denial-of-service
  attacks, flooding the world's hard drives with pictures of cats) emerge from these interactions. 
- **The Stock Market** consists of decentralized trades, but systemic crashes still occur due to feedback loops.

By decomposing a system into independent parts, we don’t make complexity disappear. We just **move it to the spaces
between components**, making it harder to trace and debug. The failure of one microservice might not seem catastrophic,
but when combined with latency, network failures, and race conditions, the overall system becomes more fragile than a
tightly coupled monolith.

Let us look more deeply at some examples.

### Agile: Local Optimization at the Cost of System Level Quality

Agile methodologies encourage breaking work into small, independent user stories that can be developed and delivered
quickly. While this approach improves **local efficiency**, it often leads to **global incoherence**:

- Teams focus on delivering their individual stories without fully understanding how their components interact at the
  system level.
- Frequent iterations favor short-term fixes over long-term architectural soundness.
- Dependencies between components and their interactions at the system level are discovered **too late**, often leading to unforeseen integration issues.

If we look at some of the largest, most complex and durable systems in the world, these were not made by agile
methods. 

The Linux kernel can possibly be incrementally maintained - but it needs an architect and a hard working super-brain 
like Linus to drive it. It evolves via a deeply coupled, community of contributors using a culture carefully evolved
for that purpose.

The IBM mainframe, still in use today, was made by carefully planning the system as a whole - and by continuously
refining the design at the system level. 

The Internet itself - designed as a military project, one of the least agile environments in the world. It was made to
withstand attacks on individual components by giving each subsystem a high degree of autonomy and ability to
discover its peers. It is an interwoven set of protocols carefully designed to function at the system level 
from the very birth of the system.

### Unit Testing: Isolating Logic at the Cost of System Understanding

Unit testing and its ugly sibling: Test Driven Development - is a set of ideas that just wont die. The premise is that 
each function, class, or service should be tested in *complete* isolation. While this makes individual units reliable, 
it doesn't account for how they interact within the whole system:

I have touched on this in a [previous blog post](./testing-is-hard.md), but the key points are:

- **Unit tests give a false sense of security**: Just because a function works in isolation does not mean it will behave
  correctly in real-world use cases.
- **Mocks and stubs introduce artificial decoupling**: Developers often create artificial, oversimplified test
  environments that do not reflect real-world dependencies. The time spent on mocks would often be better
  spent on functional testing, validating that the system as a whole works.
- **Complexity still exists, just outside of unit tests**: Many critical failures occur at the integration level, where
  unit tests provide no visibility.
- **Unit tests often add complexity** - every line of code that you maintain is a potential source of bugs. A system heavily 
  covered in pointless unit tests asserting banalities has "change latency". Having to revisit all tests makes refatoring
  across components a daunting task.

In nature, testing happens at **the system level**. Organisms (which are orders of magnitude more more complex that any 
programs we write) don’t test individual cells in isolation; they test survival ... in real environments. 

### Microservices: Distributing Complexity Instead of Reducing It

The shift from monoliths to microservices was supposed to improve scalability, flexibility, and maintainability.
However, in many cases, it simply shifts complexity elsewhere:

- **Operational Overhead**: Deploying, monitoring, and maintaining dozens of services requires significant
  infrastructure (Kubernetes, service meshes, API gateways, message queues, distributed tracing, etc.). All these components
  are further sources of complexity and bugs.
- **Performance Issues**: Microservices introduce **network latency, serialization costs, and increased failure points**
  due to remote calls. This leads to even more distribution, because what *could* run easily on a small monolith now needs
  a big, networked infrastructure in some god forsaken cloud.
- **Data Consistency Challenges**: Distributed systems introduce eventual consistency problems, because there isn't a 
  single  source of consistency (like in a database). This forces developers
  to implement compensating transactions, complex data replication, caches and event-driven architectures. Event driven
  architectures are particularly complex to reason about and debug (which anyone who had to deal with a Kafka queue
  falling behind will know)
- **Debugging Complexity**: Tracing an issue in a monolith is straightforward, while debugging a microservices-based
  system requires distributed tracing, log aggregation, and deep knowledge of service interactions.

Your organisation isn't a Web 2.0 company and the problems you have are not going to be solved by microservices. 
Apologies to Google and Amazon if you are reading from inside one of those organisations.

Compare all this with the ease of debugging and building a monolith. All components live in the same memory space, or at
least the same instance of the operating system. You can literally "see" everything by executing `top` and attaching a 
debugger directly to each process. Yes, in principle you could have the same debugging experience with sufficient 
tooling in a microservice world. But those tools don't exist yet - and maybe never will (sorry Loki, you are still 
a child in this world).

### ORMs: Abstracting SQL at the Cost of Power and Performance

Object-Relational Mappers (ORMs) are designed to decouple application logic from direct database interactions by
providing an abstraction layer over SQL. The common excuses are: "I allows me to switch database if I need to" and 
"I can use OO style logic to access the database"

First, switching databases is an incredibly rare event. Doing so isn't that hard (I have done several such projects
in my career). SQL, despite its many variants, is still reasonably standardised (except MySQL, but if you picked that you
got [bigger problems](https://www.theregister.com/2021/12/06/mysql_a_pretty_poor_database/) than an ORM can help you 
solve). Hacking the ORM to work with a different database is really tricky and not the smooth migration that ORM abusers 
think it is. Databases have subtleties that the people who write ORM simply don't understand (Because if they did, 
they wouldn't have written an ORM in the first place). When you replace the database software  - the ORM may suddenly 
change behaviour in subtle ways that would be obvious if you had just ported the SQL. 

Second, OO is *one* way to write code - it isn't the *only* one. Perhaps (very likely) OO isn't even *best* way to write
code (if there is such a thing). Each problem domain has its own languages, SQL happens to be a language custom made for 
dealing with complex data. If you have decided to learn an ORM, maybe you are better off learning SQL instead. Broaden
your horisons, as they say.

Third, while ORM proponents tell you it will simplify data access - what an ORM really does is to **cripple the full power
of SQL**:

- **Inefficient Queries**: ORMs generate queries that are often suboptimal compared to hand-written SQL, leading to
  unnecessary joins, excessive data retrieval, and poor indexing usage. That in turn leads you to add caches (nearly always 
  a bad idea) and coming up with elaborate hacks to get the same performance the database would have delivered if you just used SQL
- **Loss of SQL’s Expressiveness**: SQL is a declarative language designed for complex querying. It has survived
  longer than you have been alive. It will be here long after we are both dead. Yet ORMs force
  developers into rigid object-based interactions that fail to leverage SQL’s full capabilities. 
- **Hidden Complexity**: The illusion of simplicity disappears when performance tuning becomes necessary. Suddenly,
  developers must dig deep into ORM internals to understand query generation and optimisation. 

Instead of decoupling you from the database, ORMs introduce a subtle level of coupling that ultimately leads to higher
complexity than if you had just used SQL.

"ORM will decouple me from the database" ... is a lie.

# Nature doesn't do This!
While our industry (IT) pushes for decoupling at all costs, nature offers a different lesson: Evolution creates systems 
that are inherently coupled and which rely on deep interconnections to function efficiently. Rather than enforcing 
strict separations, mother nature balances modularity with integration.

## Biological Systems: Coupled for Survival
- **Cells and Organisms:** The human body is not composed of loosely connected independent parts but highly interconnected subsystems. While cells operate on their own. Macros level systems such as heart, lungs, and brain depend on feedback from each other to function properly.
- **Neural Networks:** The brain is the most complex, highly coupled systems in existence. Neurons form adaptive, redundant networks that ensure resilience. Brains work *because* they are coupled, not despite it.
- **Immune System:** Instead of separating components, the immune system interweaves different response mechanisms into a defense network that can adapt and restructure itself when new threats are present.

## Ecosystems: Interdependence Creates Useful Macro behaviours
- **Food Chains:** A predator-prey system is not a set of isolated modules but a deeply interwoven network of mutual dependencies. Removing one species can have strong, even catastrophic, effects on the system. Yet, the system exhibits surprising resilience when faced with large, outside changes (i.e. we humans are still here)
- **Climate and Weather Systems:** Decoupling one factor from a climate model leads to an incomplete and inaccurate understanding of global weather patterns. The system cannot be understood purely from its components, only through modelling its macro behaviour.

## Nature Avoids Over-Decoupling
Nature relies on emergent behaviours to create complex systems. The most sophisticated, biological functions emerge from 
the interaction of deeply coupled subsystems.

Consider the anthill, a result of a bunch of simple state machines, operating together in a network to form an emergent behaviour.

On the other hand, nature also uses decoupling when it is effective to so do. For example, 
cells operate mostly independently (which is how evolution got off the ground in the first place - sorry, but not sorry, creationists). 
Individual "modules" evolved several times because they are useful in themselves without 
needing coupling to function. For example, the eye has evolved independently in many species.

The lesson we can take from nature is: 

"Decoupling should be used strategically, not as a universal principle"

# Other Humans aren't obsessing over de-coupling either
Most traditional fields of engineering embrace coupling as an inherent and necessary aspect of system design. 
In these fields, components are not designed to be loosely connected and interchangeable, but work together
in interdependent, tightly integrated ways. This reduces both complexity and cost.

## Structural Engineering: Deeply Integrated Systems create Stability
Bridges, buildings, and road networks rely on strong, interconnected structures rather than loosely coupled components.

While each component has known, structural properties (and we could even say it can be tested in isolation), the system
as a whole is designed with coupling in mind.

- **Buildings:** Beams, foundations, and load-bearing walls must work in tandem to carry the structure. The elevators in skyscrapers must be carefully designed to fit into the overall properties of each component.
- **Urban Infrastructure:** Cities function as highly coupled systems where roads, water supply, and power grids work in coordination. Each system often has fail safes in place that are deeply aware of the state of the other systems.

## Mechanical Engineering: Precision from Integration
Mechanical systems are optimized through tight coupling between components to maximize performance, cost and reliability.

Consider cars as an example.

Pistons, crankshafts, and fuel injectors must operate with precision timing even though each component is locally
decoupled (in the sense that it can be tested in isolation). Components are being made to exact specification
of the entire engine system. Testing at the system level has feedback loops that drive the refinement of each
component. If each part was designed in isolation, the system as a whole would be more expensive to build and 
more likely to fail in unpredictable ways.

Brakes must be carefully designed with the properties of the entire car in mind (weight, tires, potential top speed). 
The more complex the car and the faster it can go - the higher the coupling becomes between components as weight and
functionality is carefully balanced against the desired speed.

On the other hand: Car seats, apart from their weight in a race car - can be designed largely in isolation. They
can be replaced fully without affecting the car itself. They are therefore decoupled from the car because it makes
sense to do so. But, what we appreciate about a luxury car is *exactly* the way each component seems to fit into the 
whole - including the aesthetics of the interior (Tesla owners: you wouldn't understand this point - but trust me on
this if you buy German one day).

## Law: Interwoven by Design!
Legal systems embrace coupling as a fundamental necessity for coherence, enforceability and governance. 

Laws, regulations, and judicial precedents are not isolated rules but parts of a deeply interconnected structure 
that maintains order and consistency (sorry Trump voters who still think the Great Orange Leader is not crazy: you 
wouldn't understand this point - you can skip reading now).

### A Web of Interdependent Rules
Legal statutes do not exist in isolation. A single law often references multiple others, ensuring that new provisions 
align with existing frameworks. Laws are complex networks of dependencies that must be considered together to understand
their full implications. There can even be contradictions between these frameworks - but that does not prevent the system 
from functioning at the macro level.

Government branches (executive, legislative, judicial) are coupled through constitutional mechanisms, preventing any 
single entity from gaining unchecked power. The system is explicitly designed to be interdependent and not have a strict 
hierarchy of "power modules".

# What can we learn from other fields of human behaviour?
Coupling is the norm in nearly every other field of engineering and human effort. Instead of avoiding coupling - because 
it is too hard to grasp - it should be embraced and managed. Coupling leads to cheaper, more reliable 
and more effective systems level designs.

Coupling is also how we govern our species and run our economies at scale. Despite countless wars
and attempts at destroying each other, we are still here. Something about coupling works!

Why are we not doing this in IT? 

It wouldn't be me, if I didn't have a theory...

## Why is IT obsessed with decoupling? The Low Barrier to Entry

Unlike other fields of engineering, software development has an unusually low barrier to entry. Becoming a mechanical
engineer, civil engineer or a solicitor requires years of formal education, certifications, and real world experience. 
In contrast, many software developers enter the field through self-learning, coding boot camps, or without
formal training at all. The money you can make in our industry attracts a lot of bullshit artists and charlatans.

Because of this, we live in an industry where:

- Fundamental principles of **systems thinking and complexity management** are often overlooked in favor of short-term,
  isolated problem-solving (ex: Agile, Unit Testing, blindly applying patterns)
- Best practices from traditional engineering disciplines, such as stress-testing entire systems rather than
  individual components, are not widely adopted (Because they are hard to do without formal training). Instead, IT best 
  practices focus on local optimisation (coding standards, over application of patterns in areas they don't belong, 
  clunky PR processes that assume human reviews are good at spotting bugs)
- Leaky Abstractions (like ORMs and Microservices) are widely accepted because they
  make things easier for beginners and limit the blast radius of stupid choices to your part of the organisation ("not my fault" engineering).
- The money flow in IT is tuned towards quick profits instead of long term, maintainable code. Often, systems come into production
  with no idea how they will survive. But that doesn't matter, because you can just sell the company before you have to face the consequences.

The outcome of all these factors is a generation of developers who are not trained in the principles of system
design. "Engineers" who only know how to optimise for solving local problems. Decoupling is a local optimisation 
that is easy to understand, whereas the principles of system design with coupled components takes experience to grasp.

Did I mention that LLMs will make this worse?

# Database Architecture: An Example of Managed Coupling
Databases can often gain significant benefits by carefully choosing when to couple and when not to. 

The optimiser benefits from being de-coupled from the rest of the database (example: GPORCA). This allows us to test 
the optimiser in isolation and to swap out the optimiser for a different, experimental one. Here, we apply de-coupling, 
because it isolates the interface of a very complex component (the optimiser) and prevents the complexity of that 
component from bleeding into other components. But, we often find that some queries are "trivial" and do not need the 
optimiser, or need a shortcut through the optimiser (which is an expensive code path). For example `SELECT` statements 
without joins and singleton `INSERT` statements. Instead of letting the optimiser build an entire query graph of a 
trivial query, we can build such a graph directly in the parser the moment we realise that the query we are currently 
parsing is of that type. For OLTP systems, such optimisations can lead to significant performance improvements (10-100x) 
and allows us to apply optimisations to a very specific code path highly coupled with the parser and optimiser.

We can often gain significant performance improvements and simplify the architecture, by coupling a code generator 
with the Execution Engine - injecting generated code directly into the pipeline of execution instead of letting the 
execution engine interpret each node in the query graph. 

It also desirable to have a tightly coupled query lifetime component. This aids in debugging and managing complexity
from the perspective of the user. The database should always be able to answer the question: "Where is the query right 
now and what is it doing?". Such a lifetime component must be aware of nearly every other component in the system - and 
every other component will need a way to send information to this mechanism. In a way, the query 
lifetime component it the central nervous system of the database - tightly coupled with every other component. It also
means that the query itself becomes highly coupled with the entire stack.

# Summary: When to Decouple and when to Couple

Our industry needs to rethink our obsession with decoupling. Like Patterns and "Best practises" - we are blindly
applying the "decoupling is always good" principle locally, thinking it will lead to better system level design globally. 
The result is overly complex, expensive and fragile designs with a great deal of technical debt and code duplication.

Instead of automatically asking “How do we break this apart into smaller components I can understand?”, we should 
ask “How do we manage complexity so I can understand the system itself?”. 
De-coupling should only be introduced if the resulting system level design is less complex than a coupled design. Often, 
there exists a coupled design which is more maintainable, scalable and less complex than a decoupled design. As we
can see in other fields of engineering and in nature itself - coupling is the norm, not the exception. This insight 
should humble us and make us question our a-priori decoupling strategies.

At this point, you might feel that I insulted your political views or that I made you feel angry. You might think I am 
an idiot (you're welcome - you would not be the first to say that). Now might be a good time to stop reading, before I 
further insult your sensitive feelings...


.... Oh... You are still here? Alright then...

## Stretching the Idea: Coupling as a stabilising effect on civilisation
Coupling can, in some ways, be seen as the antithesis of hierarchy. It's anti-lobster mode!

Hierarchy manages complexity by breaking it into smaller, easily understandable parts which talk to each other using 
simple rules. Hierarchy builds behaviour one step at a time, by clearly placing responsibilities on each component. 
Unfortunately, the outcome is often a system that is brittle and prone to cascading, systemic failures. It also
results in systems that are often incomprehensible to each actor in the system (because knowledge is isolated). When 
designing hierarchies, we place an enormous amount of trust in "architects" (or politicians, or CEOs) being able to 
manage the resulting complexity. As should be clear from anyone who has lived on the planet and paid attention, this 
trust is nearly always misplaced.

Coupling manages complexity by allowing parts to interact with each other in complex ways governed 
by rules (or laws of nature) that result in desirable, emergent behaviours. It relies on each component understanding a 
larger part of the system than in a hierarchy. The complexity reduction of coupling comes about by allowing each 
component to be more resilient against changes in the system as a whole - because the component has enough "knowledge"
to build this resilience.

The analogy to political systems should be clear. One of the greatest achievements of civilisation is the creation of 
a form of government (democracy) where each "component" (the individual) has a great deal of autonomy and resilience. 
Pretty much everything we today call "modern civilisation" has been built by civilisations that operate as  highly 
coupled systems. From the iPhone in your pocket, the crop yield of your local farms, the fridge that keeps that food from 
rotting, the car you drive, the roads you drive on, the tools you use for building a house, the plane you use to fly 
to holiday, the straw (plastic or paper) in your drink on the beach, the sunscreen preventing you from getting cancer 
when you tan, the cancer treatment in case you get it anyway. These all came out of systems that run the
"democratic operating systems" of autonomous actors. Coupling works! It creates useful things that make humans happy.

The idea of trusting each actor with independent decision making and power stands in stark contrast to the idea of
hierarchical control. Coupled systems are more resilient to change and ultimately, more stable than hierarchical systems.
The collapse of the Soviet Union is a good example of what happens when a hierarchical system (the Soviets) stands face
to face with a coupled system that can adapt. The establishment of highly coupled organisations (ex: The UN, the EU, WHO) 
are examples of how we can introduce coupling into human governance to construct systems which, while slow moving, are 
able to stabilise the world we live in and adapt to technological change in a responsible manner. This slows things 
down, but it avoids the chaos which ensued when the world was controlled by power hierarchies competing with each other. 
Coupling comes with its own complexity: The protocols and ground rules needed for actors to communicate effectively. 
I personally feel we have failed at adapting those protocols to the modern, globalist world. That does not make the 
system itself broken and we shouldn't remove coupling - that would just result in the same amateur systems we get 
from blindly applying decoupling. But perhaps we need a few software updates to make each component more resilient.

Coupled systems take more effort the understand. They require a deeper appreciation of the system as a whole. They
require you to engage with the *reasons* things are like they are. Taking a sledgehammer to a highly 
coupled system and replacing it with the will of a few individuals who value hierarchy, is playing with toys neither 
you, nor anyone else, understand. If you are playing with those toys, you are betting with not just your own future, but
that of your children.

