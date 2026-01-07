FROM --platform=$BUILDPLATFORM node:slim AS node-builder
RUN mkdir /app
WORKDIR /app
COPY web/ .
RUN npm install
RUN npm run build

FROM --platform=$BUILDPLATFORM golang:1.25 AS builder-golang
ARG TARGETOS
ARG TARGETARCH
RUN mkdir /app
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
RUN mkdir cmd
COPY cmd ./cmd
RUN mkdir internal
COPY internal ./internal
RUN GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build ./cmd/main.go

FROM ubuntu AS runtime
WORKDIR /app
COPY --from=builder-golang /app/main kube-ops-view-ng
RUN mkdir -p web/dist
COPY --from=node-builder /app/dist /app/web/dist
COPY LICENSE LICENSE
RUN echo "Sourcecode available at https://github.com/pettersolberg88/kube-ops-view-ng" > Source.txt

ENTRYPOINT ["/app/kube-ops-view-ng"]

USER 1000
