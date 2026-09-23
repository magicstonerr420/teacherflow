# Class folders and teaching history

My lessons → Classes uses the same saved classes as the lesson builder. A teacher can create a class, add existing saved lessons, record one taught date and private notes per lesson/class, search or filter the class, and view the dated teaching history. A lesson can be reused in several classes with separate notes. Moving to another class is atomic; an existing destination retains its own notes. Removing an assignment or class never deletes the original saved lesson or changes its generation allowance.

Class links and notes use tf_class_lessons in TEACHERFLOW_BETA_DB, alongside saved class settings and existing backups. Each mutation verifies both the authenticated teacher's Supabase lesson and their saved class. Account changes remount the UI and use separate query keys, including delayed responses. Deleting a class removes only its class links.

Tests cover ownership, persistence, strict calendar dates, atomic moves, existing destination history, failures, mobile layout, account switching, and the existing All lessons/Favorites/Unfinished views. The browser fixtures use simulated services; they do not create real teacher data or generate AI content.
