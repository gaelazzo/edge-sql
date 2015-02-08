edge-sql-maxpower
=======

This branch from edge-sql contains some improvements like:

1) support for DateTime values

2) support for transaction having the ability to open and close a connection keeping it open in the while

3) support for null values (LOL!!!)

4) packet-ized output option ouput is in the form {meta:[column names], rows:[[array of values]]} when packet size=0, otherwise meta and rows are given separately, with packets of max 'packet size' rows of data 

5) support for Decimal values

6) support for any kind of command (as Ryan says 'just do it'), via a cmd parameter. If it is 'nonquery', a ExecuteNonQuery is runned, otherwise a ExecuteReaderAsync 

7) support for multiple result set: they are returned as [ {meta:[column names], rows:[[..]]}, {meta:[column names], rows:[[..]]}, ....}

8) support for smallint (Int16) values

9)it is possible to pass connectionString as parameter

10) it is possible to pass a connection handler as parameter 

11) additional commands provided through cmd parameter are:  open, close, nonquery. "nonquery" commands are useful for updating db, where the sql result is the number of rows affected. This value is returned in "rowcount" output field.

12)
For any other information: read the code :)

I'll complete sources and example as soon as possible
