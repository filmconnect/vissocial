import os
from psycopg import Connection
from psycopg.rows import dict_row
DATABASE_URL=os.getenv('DATABASE_URL')

def get_conn()->Connection:
  return Connection.connect(DATABASE_URL, row_factory=dict_row)
