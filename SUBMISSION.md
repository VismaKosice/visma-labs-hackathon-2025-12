# Submission Guide

This document explains how to submit your solution for the Visma Performance Hackathon.

## Repository Structure

Each team has their **own repository**, created by the organizers from a shared template. Your repository already contains all the assignment documentation.

## Getting Started

### 1. Clone your team's repository

The organizers will give you a link to your team's repository.

```bash
git clone <your-team-repo-url>
cd <your-repo-name>
```

### 2. Build your solution

Implement the pension calculation engine as described in `README.md`. Your solution must:

- Expose `POST /calculation-requests` on **port 8080**
- Accept and respond according to `api-spec.yaml`
- Be packaged as a **Docker container**

### 3. Create a Dockerfile

Place a `Dockerfile` in the **root of the repository**. This is required -- it's how we build and test your solution.

Your Dockerfile must:
- Build your application
- Expose port 8080
- Start your HTTP server on port 8080

**Example (Node.js):**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 8080
CMD ["node", "src/index.js"]
```

**Example (Go):**
```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o server .

FROM alpine:3.19
COPY --from=builder /app/server /server
EXPOSE 8080
CMD ["/server"]
```

**Example (Java/Spring Boot):**
```dockerfile
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /app
COPY . .
RUN ./mvnw package -DskipTests

FROM eclipse-temurin:21-jre-alpine
COPY --from=builder /app/target/*.jar app.jar
EXPOSE 8080
CMD ["java", "-jar", "app.jar"]
```

### 4. Test locally

Before pushing, verify your Docker image builds and works:

```bash
# Build the image
docker build -t my-engine .

# Start the container
docker run -p 8080:8080 my-engine

# In another terminal, send a test request
curl -X POST http://localhost:8080/calculation-requests \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "test",
    "calculation_instructions": {
      "mutations": [{
        "mutation_id": "00000000-0000-0000-0000-000000000001",
        "mutation_definition_name": "create_dossier",
        "mutation_type": "DOSSIER_CREATION",
        "actual_at": "2025-01-01",
        "mutation_properties": {
          "dossier_id": "11111111-1111-1111-1111-111111111111",
          "person_id": "22222222-2222-2222-2222-222222222222",
          "name": "Test Person",
          "birth_date": "1965-01-01"
        }
      }]
    }
  }'
```

You should get a `200 OK` response with a `situation` object containing the created dossier.

### 5. Push your code

```bash
git add .
git commit -m "Initial implementation"
git push origin main
```

Push as often as you like -- the organizers will use the latest commit at the time of code freeze.

## How We Test

After code freeze, the organizers will:

1. Clone your repository
2. Build a Docker image from your `Dockerfile`
3. Start the container and run the full test suite (correctness, performance, bonus features)
4. Score your solution and generate the leaderboard

All teams are tested on the **same hardware** with the **same parameters** for a fair comparison.

## Requirements Checklist

Before your final submission, verify:

- [ ] `Dockerfile` exists in the repository root
- [ ] `docker build .` completes successfully
- [ ] Container starts and listens on port 8080
- [ ] `POST /calculation-requests` returns HTTP 200 for valid requests
- [ ] Response matches the structure defined in `api-spec.yaml`

## Environment Variables

Your container may receive these environment variables at runtime:

| Variable | Description | When Set |
|---|---|---|
| `SCHEME_REGISTRY_URL` | URL of the Scheme Registry service for bonus integration | During bonus testing only |

If `SCHEME_REGISTRY_URL` is set, your engine should use it to fetch scheme parameters. If not set, use the default accrual rate of `0.02`. See `README.md` for details on the Scheme Registry bonus.

## Important Notes

- **Push early, push often** -- organizers will use the latest commit at code freeze
- **Any programming language is allowed** -- as long as it runs in Docker and serves HTTP on port 8080
- **AI tooling is allowed** -- you may use AI coding assistants
- **Test your Docker build locally** -- if `docker build .` doesn't work on your machine, it won't work on ours

## Questions?

- Assignment details: `README.md`
- API contract: `api-spec.yaml`
- Data model: `data-model.md`
- Quick reference: `QUICK_START.md`
