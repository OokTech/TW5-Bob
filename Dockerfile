FROM node:lts-alpine AS build

RUN apk add git && \
git clone --depth=1 --branch v5.2.3 https://github.com/Jermolene/TiddlyWiki5.git && \
git clone --depth=1 https://github.com/OokTech/TW5-Bob.git TiddlyWiki5/plugins/OokTech/Bob && \
mkdir TiddlyWiki5/Wikis && \
cp -r TiddlyWiki5/plugins/OokTech/Bob/MultiUserWiki TiddlyWiki5/Wikis/BobWiki/ && \
rm -rf TiddlyWiki5/.git && \
rm -rf TiddlyWiki5/plugins/OokTech/Bob/.git && \
rm TiddlyWiki5/Wikis/BobWiki/settings/settings.json && \
mv TiddlyWiki5/Wikis/BobWiki/settings/docker-settings.json TiddlyWiki5/Wikis/BobWiki/settings/settings.json

FROM node:lts-alpine

COPY --from=build /TiddlyWiki5 /TiddlyWiki5

VOLUME /TiddlyWiki5/Wikis/

WORKDIR /TiddlyWiki5

# wikis port
EXPOSE 8080/tcp
EXPOSE 8080/udp
# saver server port
EXPOSE 61192
# federation port
EXPOSE 3232/tcp
EXPOSE 3232/udp

CMD [ "node", "./tiddlywiki.js", "Wikis/BobWiki", "--wsserver"]
#CMD ["/bin/sh"]

