#=============================================================================
UUID=$(shell cat src/metadata.json | python -c "import json,sys;obj=json.load(sys.stdin);print obj['uuid'];")
SRCDIR=src
BUILDDIR=build
FILES=metadata.json *.js stylesheet.css schemas
MKFILE_PATH := $(lastword $(MAKEFILE_LIST))
MKFILE_DIR := $(dir $(MKFILE_PATH))
ABS_MKFILE_PATH := $(abspath $(MKFILE_PATH))
ABS_MKFILE_DIR := $(abspath $(MKFILE_DIR))
ABS_BUILDDIR=$(ABS_MKFILE_DIR)/$(BUILDDIR)
#=============================================================================
default_target: all
.PHONY: clean all zip

clean:
	rm -rf $(BUILDDIR)

# compile the schemas
all: clean
	mkdir -p $(BUILDDIR)/$(UUID)
	cp -r src/* $(BUILDDIR)/$(UUID)
	@if [ -d $(BUILDDIR)/$(UUID)/schemas ]; then \
		glib-compile-schemas $(BUILDDIR)/$(UUID)/schemas; \
	fi

zip: all
	(cd $(BUILDDIR)/$(UUID); \
         zip -rq $(ABS_BUILDDIR)/$(UUID).zip $(FILES:%=%); \
        );
