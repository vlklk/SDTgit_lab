import unittest

def area(a, b):
    return a * b

def perimeter(a, b):
    return (a + b) * 2

class RectangleTestCase(unittest.TestCase):
    def test_area_zero_second_side(self):
        res = area(10, 0)
        self.assertEqual(res, 0)

    def test_area_square(self):
        res = area(10, 10)
        self.assertEqual(res, 100)

    def test_area_rectangle(self):
        res = area(5, 7)
        self.assertEqual(res, 35)

    def test_perimeter_square(self):
        res = perimeter(10, 10)
        self.assertEqual(res, 40)

    def test_perimeter_rectangle(self):
        res = perimeter(3, 4)
        self.assertEqual(res, 14)

    def test_perimeter_zero_side(self):
        res = perimeter(0, 10)
        self.assertEqual(res, 20)
