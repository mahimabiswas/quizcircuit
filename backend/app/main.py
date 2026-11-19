from fastapi import FastAPI

app = FastAPI(title="QuizCircuit")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
