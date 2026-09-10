.PHONY: install run demo web build clean

install:
	npm install

run:
	npm start

demo:
	npm run demo

web:
	npm run start:web

build:
	npm run build

clean:
	rm -rf dist node_modules
	rm -rf workspace/*
	@echo "Kept .fantasia/ memory intact. To wipe memory: rm -rf .fantasia/*"
