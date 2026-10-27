# PocketBase binary + app files. All data lives in the /pb/pb_data volume.
FROM alpine:3.22 AS fetch
RUN apk add --no-cache curl
WORKDIR /pb
COPY PB_VERSION fetch-pb.sh ./
RUN sh fetch-pb.sh

FROM alpine:3.22
RUN adduser -D -H -u 10001 santa && mkdir -p /pb/pb_data && chown santa /pb/pb_data
WORKDIR /pb
COPY --from=fetch /pb/pocketbase ./
COPY pb_migrations pb_migrations
COPY pb_hooks pb_hooks
COPY pb_public pb_public
USER santa
VOLUME /pb/pb_data
EXPOSE 8090
ENTRYPOINT ["/pb/pocketbase"]
CMD ["serve", "--http=0.0.0.0:8090"]
