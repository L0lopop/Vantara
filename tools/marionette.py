"""Клиент Marionette — инспекция интерфейса браузера из кода.

Интерфейс браузера нельзя посмотреть инструментами для сайтов: это не
веб-страница, а chrome-документ. Marionette — штатный протокол Mozilla,
который даёт к нему доступ и позволяет выполнять код прямо в окне браузера.

Зачем нужен: без него проверка CSS сводится к разглядыванию скриншотов.
С ним видно, какое правило реально выиграло, а какое проиграло и кому.

Запуск браузера:
    firefox --marionette -remote-allow-system-access --profile <путь>

Использование:
    from marionette import Marionette
    with Marionette() as m:
        print(m.script("return document.title"))

Протокол: TCP, каждое сообщение — "<длина>:<json>".
Команда — [0, id, "Имя", params], ответ — [1, id, ошибка, результат].
"""

from __future__ import annotations

import json
import socket
from typing import Any


class MarionetteError(RuntimeError):
    """Браузер вернул ошибку на команду."""


class Marionette:
    def __init__(self, host: str = "127.0.0.1", port: int = 2828,
                 timeout: float = 30.0) -> None:
        self.host = host
        self.port = port
        self.timeout = timeout
        self._sock: socket.socket | None = None
        self._buffer = b""
        self._next_id = 1

    # --- Соединение --------------------------------------------------------

    def __enter__(self) -> "Marionette":
        self.connect()
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def connect(self) -> dict[str, Any] | None:
        # Marionette принимает ровно одно соединение, поэтому повторный
        # вызов должен быть безвредным: иначе связка connect() + with
        # рвёт уже установленную сессию.
        if self._sock is not None:
            return None

        self._sock = socket.create_connection((self.host, self.port), self.timeout)
        self._sock.settimeout(self.timeout)

        # Сервер первым присылает приветствие с версией протокола.
        self._receive()

        session = self.command("WebDriver:NewSession", {})
        # Работаем в chrome: это окно браузера, а не содержимое вкладки.
        self.command("Marionette:SetContext", {"value": "chrome"})
        return session

    def close(self) -> None:
        if self._sock:
            try:
                self.command("Marionette:AcceptConnections", {"value": True})
            except Exception:
                pass
            self._sock.close()
            self._sock = None

    # --- Транспорт ---------------------------------------------------------

    def _send(self, payload: list[Any]) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self._sock.sendall(f"{len(raw)}:".encode("ascii") + raw)

    def _receive(self) -> Any:
        """Читает одно сообщение формата "<длина>:<json>"."""
        while b":" not in self._buffer:
            self._buffer += self._read_chunk()

        head, _, rest = self._buffer.partition(b":")
        size = int(head)

        while len(rest) < size:
            rest += self._read_chunk()

        self._buffer = rest[size:]
        return json.loads(rest[:size].decode("utf-8"))

    def _read_chunk(self) -> bytes:
        chunk = self._sock.recv(65536)
        if not chunk:
            raise ConnectionError("Marionette закрыл соединение")
        return chunk

    # --- Команды -----------------------------------------------------------

    def command(self, name: str, params: dict[str, Any] | None = None) -> Any:
        message_id = self._next_id
        self._next_id += 1

        self._send([0, message_id, name, params or {}])

        # Ответы приходят по порядку, но сверяем идентификатор на всякий случай.
        while True:
            reply = self._receive()
            if isinstance(reply, list) and len(reply) == 4 and reply[0] == 1:
                _, reply_id, error, result = reply
                if reply_id != message_id:
                    continue
                if error:
                    raise MarionetteError(
                        f"{error.get('error')}: {error.get('message')}")
                return result

    def script(self, body: str, args: list[Any] | None = None) -> Any:
        """Выполняет JS в chrome-контексте. Тело должно содержать return.

        Marionette заворачивает результат в {"value": ...} — разворачиваем
        здесь, чтобы вызывающий код работал с обычным значением.
        """
        result = self.command("WebDriver:ExecuteScript",
                              {"script": body, "args": args or []})
        if isinstance(result, dict) and set(result) == {"value"}:
            return result["value"]
        return result


# --- Готовые проверки -------------------------------------------------------

STYLE_PROBE = """
const [selector, props] = arguments;
const el = document.querySelector(selector);
if (!el) return { found: false };
const cs = getComputedStyle(el);
const out = { found: true };
for (const p of props) out[p] = cs.getPropertyValue(p).trim();
return out;
"""


def computed(m: Marionette, selector: str, props: list[str]) -> dict[str, Any]:
    """Считанные стили элемента интерфейса браузера."""
    return m.script(STYLE_PROBE, [selector, props])


if __name__ == "__main__":
    with Marionette() as session:
        print("Подключено к:", session.script("return document.documentURI"))
